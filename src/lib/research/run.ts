/**
 * The research job (docs/architecture/AI_ARCHITECTURE.md §3), run by
 * /api/cron/research every minute in production.
 *
 * dispatch(): lists the jobs (target × setting), records new ones in
 * `research_state`, claims the ones that are due (atomically, so runs never
 * overlap on a job) up to the in-flight limit, and fans them out: one
 * function invocation per job, each with its own time limit.
 *
 * runJob(): for one job,
 *   gather its documents (official pages, county PDFs, .gov/Ballotpedia via
 *   search; read politely, re-read at most every 6 hours)
 *   → skip if nothing changed since the last run
 *   → Claude extracts answers with exact quotes (structured output)
 *   → quotes must be in the cited document, wording passes the lint,
 *     a second call confirms each quote supports its sentence
 *   → synthesized_field_versions: compare mode stores every setting's result
 *     as held ("model comparison") for review; publish mode publishes.
 *
 * Never touches an address; logs counts only.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import type { Database, Json } from "@/lib/supabase/types";
import { aiConfig, settingId, type AiConfig, type Setting } from "@/lib/ai/config";
import { checkSupport, extract, PROMPT_VERSION, type CallResult, type Doc } from "@/lib/ai/extract";
import { MeasureResearch, OfficeResearch, PersonResearch } from "@/lib/ai/schemas";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { billingPeriod } from "@/lib/usage/quota";
import type { Resolver } from "@/lib/feeds/safeFetch";
import { logEvent } from "@/lib/observability/log";
import compareSet from "@/data/research/compare-set.json";
import { focusText, getDocument, REREAD_AFTER_MS, type Fetched, type FetchDeps } from "./fetch";
import { ballotpediaCampaignSite, searchUrls } from "./search";
import { buildTargets, pdfHostOk, taskFor, type ContestRow, type Target, type TargetPage } from "./targets";
import { findLinkEntries } from "./text";
import { buildPayload, payloadIsEmpty, screenMeasure, screenOffice, screenPerson, type FetchedDoc, type Payload, type Pending } from "./verify";

type Db = SupabaseClient<Database>;

const SPEND_METRIC = "anthropic.microusd";
const MAX_DOC_CHARS = 60_000;
const MAX_TOTAL_CHARS = 200_000; // ~50K tokens: well under Haiku's 100K-token price tier
const MAX_FOLLOW = 4;
const SEARCH_TTL_MS = 7 * 24 * 3600_000;
const RECHECK_MS = 6 * 3600_000;
const COMPARE_RECHECK_MS = 7 * 24 * 3600_000;
const LOCK_SECONDS = 300;

export interface Job {
  stateKey: string;
  target: Target;
  setting: Setting;
  compare: boolean;
  election: string;
}

export interface ResearchDeps {
  db: Db;
  electionId: string;
  /** For the curated enrichment (official campaign links); defaults to the Nov 3 slug. */
  electionSlug?: string;
  config?: AiConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  client?: Pick<Anthropic, "messages">;
  sleep?: (ms: number) => Promise<void>;
  /** How the dispatcher runs a claimed job (default: a call to this route). */
  runRemote?: (stateKey: string) => Promise<unknown>;
  /** Compare mode's items (default: src/data/research/compare-set.json). */
  compareKeys?: string[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function loadContests(db: Db, electionId: string): Promise<ContestRow[]> {
  const out: ContestRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("contests")
      .select("id, kind, contest_type, title, division_key, divisions(name, state, scope), contest_candidates(id, ballot_name, display_name, campaign_url)")
      .eq("election_id", electionId)
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error(`research contests: ${error.message}`);
    for (const c of data ?? []) {
      const div = Array.isArray(c.divisions) ? c.divisions[0] : c.divisions;
      out.push({ ...c, divisions: div ?? null, contest_candidates: c.contest_candidates ?? [] } as ContestRow);
    }
    if ((data ?? []).length < 500) return out;
  }
}

/** The jobs for this mode: compare = the comparison set × every setting; publish = every target × its kind's setting. */
export function jobsFor(cfg: AiConfig, targets: Target[], election: string, compareKeys: string[] = (compareSet as { targets: { key: string }[] }).targets.map((t) => t.key)): Job[] {
  if (cfg.mode === "compare") {
    const wanted = new Set(compareKeys);
    return targets
      .filter((t) => wanted.has(t.key))
      .flatMap((t) => cfg.compare.map((setting) => ({ stateKey: `${t.key}@${settingId(setting)}`, target: t, setting, compare: true, election })));
  }
  return targets.map((t) => ({
    stateKey: t.key,
    target: t,
    setting: cfg.publish[t.field === "measure" ? "measure" : t.field === "office" ? "office" : "profile"],
    compare: false,
    election,
  }));
}

async function monthSpend(db: Db, now: Date): Promise<number> {
  const { data } = await db.from("api_usage").select("count").eq("period", billingPeriod(now)).eq("metric", SPEND_METRIC).maybeSingle();
  return data?.count ?? 0;
}

async function recordSpend(db: Db, now: Date, micro: number) {
  if (micro > 0) await db.rpc("add_api_spend", { p_period: billingPeriod(now), p_metric: SPEND_METRIC, p_amount: micro });
}

export interface DispatchSummary {
  jobs: number;
  claimed: number;
  inflight: number;
  stoppedBy?: "budget" | "disabled";
}

/** Every minute: record new jobs, claim the due ones, fan them out. */
export async function dispatch(deps: ResearchDeps): Promise<DispatchSummary> {
  const cfg = deps.config ?? aiConfig();
  const now = deps.now ?? new Date();
  const { db } = deps;
  if (!cfg.enabled) return { jobs: 0, claimed: 0, inflight: 0, stoppedBy: "disabled" };
  const targets = buildTargets(await loadContests(db, deps.electionId), getEnrichment(deps.electionSlug ?? "2026-11-03"));
  const jobs = jobsFor(cfg, targets, deps.electionId, deps.compareKeys);
  // New jobs are due now; existing ones keep their schedule.
  for (let i = 0; i < jobs.length; i += 200) {
    const rows = jobs.slice(i, i + 200).map((j) => ({ key: j.stateKey, target: { ...j.target, setting: j.setting, compare: j.compare, election: j.election } as unknown as Json }));
    await db.from("research_state").upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  }
  if ((await monthSpend(db, now)) >= Math.floor(cfg.monthlyBudgetUsd * 1_000_000)) {
    logEvent("research.dispatch", { jobs: jobs.length, claimed: 0, stoppedBy: "budget" });
    return { jobs: jobs.length, claimed: 0, inflight: 0, stoppedBy: "budget" };
  }
  const { count } = await db.from("research_state").select("key", { count: "exact", head: true }).gt("locked_until", now.toISOString());
  const inflight = count ?? 0;
  const slots = Math.max(0, cfg.maxInflight - inflight);
  let claimed: string[] = [];
  if (slots) {
    const { data } = await db.rpc("claim_research_jobs", { p_keys: jobs.map((j) => j.stateKey), p_limit: slots, p_lock_seconds: LOCK_SECONDS });
    claimed = (data ?? []) as string[];
  }
  const run = deps.runRemote ?? ((key: string) => runJob({ ...deps, config: cfg }, key));
  await Promise.allSettled(claimed.map((k) => run(k)));
  const s = { jobs: jobs.length, claimed: claimed.length, inflight };
  logEvent("research.dispatch", s);
  return s;
}

interface SearchCache {
  urls: string[];
  campaign?: string | null;
  followed?: string[];
  /** When the search ran (kept a week). */
  searchedAt?: string;
  /** When the document set was last gathered (shared while the stored pages are fresh). */
  at: string;
}

/** Waits for a busy site before running anyway with what's there. */
const MAX_BUSY_WAITS = 10;
const SHARED_LOCK_MS = 240_000;

/**
 * The document set is gathered once per target and shared by every setting
 * (compare mode), so every column reads exactly the same documents: one job
 * searches, reads the pages and follows their links, then records what it
 * used; the others wait for it and read the same stored copies.
 */
async function prepareShared(
  deps: ResearchDeps & { now: Date },
  t: Target,
): Promise<{ cache: SearchCache | null; owner: boolean; cost: number; wait?: boolean }> {
  const key = `${t.key}#search`;
  const { db, now } = deps;
  const { data: row } = await db.from("research_state").select("discovered, locked_until").eq("key", key).maybeSingle();
  const cached = row?.discovered as SearchCache | null | undefined;
  if (cached && now.getTime() - Date.parse(cached.at) < REREAD_AFTER_MS) return { cache: cached, owner: false, cost: 0 };
  // Another setting's job is gathering right now: try again shortly.
  if (row?.locked_until && Date.parse(row.locked_until) > now.getTime()) return { cache: null, owner: false, cost: 0, wait: true };
  await db
    .from("research_state")
    .upsert({ key, target: { kind: "documents", of: t.key } as Json, next_check_at: "2999-01-01T00:00:00Z", locked_until: new Date(now.getTime() + SHARED_LOCK_MS).toISOString() }, { onConflict: "key" });
  const searchedAt = cached?.searchedAt ?? cached?.at;
  if (!t.search || (cached && searchedAt && now.getTime() - Date.parse(searchedAt) < SEARCH_TTL_MS)) {
    return { cache: cached ?? null, owner: true, cost: 0 };
  }
  const res = await searchUrls({ kind: t.search.kind, query: t.search.query, mustMention: t.search.mustMention, client: deps.client });
  return { cache: { urls: res.urls, campaign: cached?.campaign ?? null, followed: cached?.followed ?? [], searchedAt: now.toISOString(), at: now.toISOString() }, owner: true, cost: res.costMicroUsd };
}

async function releaseShared(db: Db, t: Target, now: Date, cache: SearchCache | null) {
  await db
    .from("research_state")
    .update({ ...(cache ? { discovered: cache as unknown as Json } : {}), locked_until: null, updated_at: now.toISOString() })
    .eq("key", `${t.key}#search`);
}

const isGovHost = (u: string) => /(^|\.)gov$/i.test(new URL(u).hostname);
const isBallotpedia = (u: string) => /(^|\.)ballotpedia\.org$/i.test(new URL(u).hostname);

/** Every document for a target, politely fetched; long ones narrowed to the passages about it. */
async function gatherDocuments(
  deps: ResearchDeps & { now: Date },
  t: Target,
  cache: SearchCache | null,
  owner = true,
): Promise<{ docs: FetchedDoc[]; campaign?: string | null; followed: string[]; busy: number }> {
  const fdeps: FetchDeps = { db: deps.db, now: deps.now, fetchImpl: deps.fetchImpl, resolve: deps.resolve, sleep: deps.sleep };
  const got: { f: Fetched; page: TargetPage }[] = [];
  const seen = new Set<string>();
  let campaign = cache?.campaign ?? null;
  const followed: string[] = [];
  let busy = 0;
  const read = async (page: TargetPage, needHtml = false) => {
    if (seen.has(page.url)) return null;
    seen.add(page.url);
    const r = await getDocument(
      fdeps,
      page.url,
      { official: page.official, publisher: page.publisher, allowPdf: page.allowPdf, sourceType: page.official ? "official" : isBallotpedia(page.url) ? "civic" : "campaign" },
      needHtml ? 0 : undefined,
      { needHtml },
    );
    if ("skipped" in r) {
      if (r.skipped === "busy") busy++;
      return null;
    }
    got.push({ f: r, page });
    return r;
  };

  // 1. Registry pages (official guides, county page, campaign site from an official filing), and the links they point to.
  const follow: TargetPage[] = [];
  // The job gathering the shared set reads the pages afresh when it has no list of links to follow yet.
  const needHtml = owner && t.follow.length > 0 && !cache?.followed?.length;
  for (const p of t.pages) {
    const r = await read(p, needHtml);
    if (!r?.html || !t.follow.length) continue;
    const links = findLinkEntries(r.html, r.url, t.follow);
    // Links that name this target (e.g. "Measure Z") first.
    const named = (l: { label: string }) => t.focus.some((f) => l.label.toLowerCase().includes(f.toLowerCase()));
    for (const l of [...links.filter(named), ...links.filter((x) => !named(x))]) {
      follow.push({ url: l.url, official: p.official, publisher: p.publisher, allowPdf: !!p.allowPdf && pdfHostOk(t.state, l.url) });
    }
  }
  // A stored copy has no HTML to follow from: reuse the pages followed last time.
  if (!follow.length) for (const u of cache?.followed ?? []) follow.push({ url: u, official: t.pages[0]?.official ?? true, publisher: t.pages[0]?.publisher, allowPdf: pdfHostOk(t.state, u) });
  for (const f of follow.slice(0, MAX_FOLLOW)) if (await read(f)) followed.push(f.url);

  // 2. Search results: .gov pages (and, for people, their Ballotpedia page).
  for (const u of cache?.urls ?? []) {
    const r = await read({ url: u, official: isGovHost(u), publisher: new URL(u).hostname, allowPdf: pdfHostOk(t.state, u) });
    // Ballotpedia names the campaign website; that's the only way a searched campaign site is used.
    if (r?.html && isBallotpedia(u)) campaign = ballotpediaCampaignSite(r.html) ?? campaign;
  }
  if (campaign && t.kind === "candidate") await read({ url: campaign, official: false });

  // Official first, then the rest; long documents narrowed to this target.
  let total = 0;
  const docs: FetchedDoc[] = [];
  for (const { f, page } of [...got.filter((g) => g.page.official), ...got.filter((g) => !g.page.official)]) {
    if (total >= MAX_TOTAL_CHARS) break;
    const text = focusText(f.text, t.focus, Math.min(MAX_DOC_CHARS, MAX_TOTAL_CHARS - total));
    total += text.length;
    docs.push({
      id: `D${docs.length + 1}`,
      sourceId: f.sourceId,
      text,
      meta: { url: f.url, title: f.title, publisher: page.publisher ?? new URL(f.url).hostname, official: page.official, fetchedAt: f.fetchedAt },
    });
  }
  return { docs, campaign, followed, busy };
}

function inputHash(t: Target, setting: Setting, docs: FetchedDoc[]): string {
  const parts = docs.map((d) => `${d.meta.url}:${sha(d.text)}`).sort();
  return sha([t.key, t.label, settingId(setting), PROMPT_VERSION, ...parts].join("\n"));
}

const transient = (problem?: string) => !!problem && /^api_(429|500|502|503|529|error)$|^error$/.test(problem);

async function finishState(db: Db, key: string, now: Date, patch: { outcome: string; hash?: string; afterMs: number; failures?: number }) {
  const jitter = Math.floor(Math.random() * 30 * 60_000);
  await db
    .from("research_state")
    .update({
      last_outcome: patch.outcome,
      ...(patch.hash ? { input_hash: patch.hash } : {}),
      next_check_at: new Date(now.getTime() + patch.afterMs + (patch.afterMs >= RECHECK_MS ? jitter : 0)).toISOString(),
      locked_until: null,
      failures: patch.failures ?? 0,
      updated_at: now.toISOString(),
    })
    .eq("key", key);
}

export interface JobOutcome {
  key: string;
  outcome: "published" | "held" | "compared" | "failed" | "no documents" | "unchanged" | "rate limited" | "waiting" | "budget" | "missing";
  spentMicroUsd: number;
}

/** One job: one target at one setting. */
export async function runJob(deps: ResearchDeps, stateKey: string): Promise<JobOutcome> {
  const cfg = deps.config ?? aiConfig();
  const now = deps.now ?? new Date();
  const d = { ...deps, now };
  const { db } = deps;
  const { data: state } = await db.from("research_state").select("target, input_hash, failures").eq("key", stateKey).maybeSingle();
  if (!state) return { key: stateKey, outcome: "missing", spentMicroUsd: 0 };
  const stored = state.target as unknown as Target & { setting: Setting; compare: boolean; election: string };
  const t: Target = stored;
  const setting = stored.setting;
  let spent = 0;

  const shared = await prepareShared(d, t);
  spent += shared.cost;
  if (shared.wait) {
    await finishState(db, stateKey, now, { outcome: "waiting", afterMs: 60_000, failures: state.failures });
    return { key: stateKey, outcome: "waiting", spentMicroUsd: spent };
  }
  const { docs, campaign, followed, busy } = await gatherDocuments(d, t, shared.cache, shared.owner);
  await recordSpend(db, now, shared.cost);
  // A site was too busy to read right now: wait and try again rather than run on fewer documents
  // (after a few tries, run with what's there).
  const busyWaits = state.failures ?? 0;
  if (busy && busyWaits < MAX_BUSY_WAITS) {
    // Keep the search; mark the document set stale so the next job gathers it again.
    if (shared.owner) await releaseShared(db, t, now, shared.cache ? { ...shared.cache, searchedAt: shared.cache.searchedAt ?? shared.cache.at, at: new Date(0).toISOString() } : null);
    await finishState(db, stateKey, now, { outcome: "waiting", afterMs: 60_000 + Math.floor(Math.random() * 60_000), failures: busyWaits + 1 });
    return { key: stateKey, outcome: "waiting", spentMicroUsd: spent };
  }
  if (shared.owner) {
    await releaseShared(db, t, now, {
      urls: shared.cache?.urls ?? [],
      campaign,
      followed: followed.length ? followed : shared.cache?.followed ?? [],
      searchedAt: shared.cache?.searchedAt ?? shared.cache?.at,
      at: now.toISOString(),
    });
  }
  if (!docs.length) {
    await finishState(db, stateKey, now, { outcome: "no documents", afterMs: RECHECK_MS });
    return { key: stateKey, outcome: "no documents", spentMicroUsd: spent };
  }
  const hash = inputHash(t, setting, docs);
  if (hash === state.input_hash) {
    await finishState(db, stateKey, now, { outcome: "unchanged", hash, afterMs: stored.compare ? COMPARE_RECHECK_MS : RECHECK_MS });
    return { key: stateKey, outcome: "unchanged", spentMicroUsd: spent };
  }
  if ((await monthSpend(db, now)) >= Math.floor(cfg.monthlyBudgetUsd * 1_000_000)) {
    await finishState(db, stateKey, now, { outcome: "budget", afterMs: 3600_000, failures: state.failures });
    return { key: stateKey, outcome: "budget", spentMicroUsd: spent };
  }

  const r = await researchOne(d, cfg, stored, setting, docs, hash);
  spent += r.spent;
  if (r.outcome === "failed" && transient(r.problem)) {
    await finishState(db, stateKey, now, { outcome: "rate limited", afterMs: 2 * 60_000, failures: state.failures });
    return { key: stateKey, outcome: "rate limited", spentMicroUsd: spent };
  }
  if (r.outcome === "failed") {
    const failures = (state.failures ?? 0) + 1;
    await finishState(db, stateKey, now, { outcome: "failed", afterMs: Math.min(RECHECK_MS, 15 * 60_000 * 2 ** Math.min(failures, 5)), failures });
    return { key: stateKey, outcome: "failed", spentMicroUsd: spent };
  }
  await finishState(db, stateKey, now, { outcome: r.outcome, hash, afterMs: stored.compare ? COMPARE_RECHECK_MS : RECHECK_MS });
  logEvent("research.job", { kind: t.kind, setting: settingId(setting), outcome: r.outcome, costMicroUsd: spent });
  return { key: stateKey, outcome: r.outcome, spentMicroUsd: spent };
}

async function researchOne(
  deps: ResearchDeps & { now: Date },
  cfg: AiConfig,
  t: Target & { compare: boolean; election: string },
  setting: Setting,
  docs: FetchedDoc[],
  hash: string,
): Promise<{ outcome: "published" | "held" | "compared" | "failed"; spent: number; problem?: string }> {
  const { db, now } = deps;
  const field = t.compare ? `${t.field}@${settingId(setting)}` : t.field;
  const started = Date.now();
  const { data: run } = await db
    .from("synthesis_runs")
    .insert({
      target_type: t.targetType,
      target_id: t.targetId,
      field_name: field,
      trigger_type: "scheduled",
      status: "running",
      model: setting.model,
      prompt_version: PROMPT_VERSION,
      source_ids: docs.map((d) => d.sourceId),
      input_hash: hash,
      started_at: now.toISOString(),
      metadata: { setting, compare: t.compare } as unknown as Json,
    })
    .select("id")
    .single();
  const runId = run?.id ?? null;

  const modelDocs: Doc[] = docs.map((d) => ({ id: d.id, title: d.meta.title, url: d.meta.url, text: d.text }));
  const call = { model: setting.model, effort: setting.effort, task: taskFor(t), docs: modelDocs, client: deps.client };
  const first: CallResult<unknown> =
    t.kind === "measure"
      ? await extract({ ...call, schema: MeasureResearch })
      : t.kind === "office"
        ? await extract({ ...call, schema: OfficeResearch })
        : await extract({ ...call, schema: PersonResearch });
  let spent = first.costMicroUsd;

  const finish = async (status: "succeeded" | "failed", extra: Record<string, unknown>, error?: string) => {
    await recordSpend(db, now, spent);
    if (runId) {
      await db
        .from("synthesis_runs")
        .update({
          status,
          error: error ?? null,
          completed_at: new Date().toISOString(),
          metadata: { setting, compare: t.compare, costMicroUsd: spent, seconds: Math.round((Date.now() - started) / 100) / 10, usage: first.usage ?? null, raw: first.data ?? null, ...extra } as unknown as Json,
        })
        .eq("id", runId);
    }
  };

  if (!first.data) {
    await finish("failed", {}, first.problem);
    return { outcome: "failed", spent, problem: first.problem };
  }

  const kind = t.kind === "measure" ? "measure" : t.kind === "office" ? "office" : "person";
  const screened =
    kind === "measure"
      ? screenMeasure(first.data as MeasureResearch, docs)
      : kind === "office"
        ? screenOffice(first.data as OfficeResearch, docs)
        : screenPerson(first.data as PersonResearch, docs);
  // The checker is the same for every setting, so only the extraction differs between columns.
  const support = await checkSupport({ model: cfg.checkModel, claims: screened.pending.map((p: Pending) => ({ text: p.text, quote: p.quote })), client: deps.client });
  spent += support.costMicroUsd;
  const built = buildPayload(kind, screened.pending, support.supported, docs, kind === "person" ? (first.data as PersonResearch).pastPositions : []);
  const rejected = [...screened.rejected, ...built.rejected];
  const empty = payloadIsEmpty(built.payload);
  const payload: Payload = { ...built.payload, ...(t.state ? { scope: { election: t.election, state: t.state } } : {}) };
  const status = t.compare || empty ? "held" : "published";
  const heldReason = t.compare
    ? "model comparison"
    : empty
      ? rejected.length
        ? `every answer failed a check (${[...new Set(rejected.map((r) => r.reason))].join(", ")})`
        : "documents had no answers"
      : null;

  await db.from("synthesized_field_versions").update({ is_current: false }).eq("target_type", t.targetType).eq("target_id", t.targetId).eq("field_name", field).eq("is_current", true);
  const content = JSON.stringify(payload);
  await db.from("synthesized_field_versions").insert({
    synthesis_run_id: runId,
    target_type: t.targetType,
    target_id: t.targetId,
    field_name: field,
    content,
    payload: payload as unknown as Json,
    source_ids: built.sourceIds,
    is_current: true,
    status,
    held_reason: heldReason,
  });
  await finish("succeeded", { rejected, supportProblem: support.problem ?? null, output_hash: sha(content) });
  return { outcome: t.compare ? "compared" : status, spent };
}
