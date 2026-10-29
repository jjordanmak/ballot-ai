/**
 * The research job (docs/architecture/AI_ARCHITECTURE.md §3), run by
 * /api/cron/research. For each target in the durable registry:
 *
 *   fetch its documents (public pages only, re-fetched at most daily)
 *   → skip if nothing changed since the last successful run
 *   → Claude extracts answers with exact quotes (structured output)
 *   → quotes must be in the cited document, wording passes the lint,
 *     a second call confirms each quote supports its sentence
 *   → synthesized_field_versions (published, or held with the reason)
 *
 * Stops at the time budget, the per-run item cap, or the month's spend.
 * Never touches an address; logs counts only.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import type { Database, Json } from "@/lib/supabase/types";
import { aiConfig, type AiConfig } from "@/lib/ai/config";
import { checkSupport, extract, PROMPT_VERSION, type Doc } from "@/lib/ai/extract";
import { MeasureResearch, PersonResearch } from "@/lib/ai/schemas";
import { billingPeriod } from "@/lib/usage/quota";
import { safeFetch, type Resolver } from "@/lib/feeds/safeFetch";
import { logEvent } from "@/lib/observability/log";
import { findLinks, htmlTitle, htmlToText } from "./text";
import { buildTargets, taskFor, type ContestRow, type Target } from "./targets";
import { buildPayload, payloadIsEmpty, screenMeasure, screenPerson, type FetchedDoc, type Pending } from "./verify";

type Db = SupabaseClient<Database>;

const SPEND_METRIC = "anthropic.microusd";
const REFETCH_AFTER_MS = 24 * 3600_000;
const MAX_DOC_CHARS = 60_000;
const MAX_TOTAL_CHARS = 200_000; // ~50K tokens: well under Haiku's 100K-token price tier
const MAX_FOLLOW = 3;
const CONCURRENCY = 3;
const USER_AGENT = "ballot.ai research (+https://ballot-ai.vercel.app)";

export interface ResearchSummary {
  targets: number;
  considered: number;
  unchanged: number;
  noDocuments: number;
  researched: number;
  published: number;
  held: number;
  failed: number;
  spentMicroUsd: number;
  stoppedBy?: "time" | "budget" | "limit";
}

export interface ResearchDeps {
  db: Db;
  electionId: string;
  config?: AiConfig;
  /** Max targets researched (Claude called) this run. */
  limit?: number;
  budgetMs?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  client?: Pick<Anthropic, "messages">;
  /** Only these target ids (manual runs on previews). */
  only?: string[];
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

async function monthSpend(db: Db, now: Date): Promise<number> {
  const { data } = await db.from("api_usage").select("count").eq("period", billingPeriod(now)).eq("metric", SPEND_METRIC).maybeSingle();
  return data?.count ?? 0;
}

async function recordSpend(db: Db, now: Date, micro: number) {
  if (micro > 0) await db.rpc("add_api_spend", { p_period: billingPeriod(now), p_metric: SPEND_METRIC, p_amount: micro });
}

interface Fetched {
  url: string;
  html?: string;
  text: string;
  title: string;
  sourceId: string;
  fetchedAt: string;
}

/** One document: the stored copy if read in the last day, else fetched and stored (sources row keyed by URL). */
async function getDocument(
  deps: ResearchDeps,
  url: string,
  meta: { official: boolean; publisher?: string },
  now: Date,
): Promise<Fetched | null> {
  const { db } = deps;
  const { data: existing } = await db.from("sources").select("id, content_text, title, fetched_at").eq("url", url).maybeSingle();
  if (existing?.content_text && now.getTime() - Date.parse(existing.fetched_at) < REFETCH_AFTER_MS) {
    return { url, text: existing.content_text, title: existing.title ?? url, sourceId: existing.id, fetchedAt: existing.fetched_at };
  }
  let res;
  try {
    res = await safeFetch(
      url,
      { headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(20_000), maxBytes: 3_000_000 },
      { fetchImpl: deps.fetchImpl, resolve: deps.resolve },
    );
  } catch {
    return null;
  }
  const type = res.headers.get("content-type") ?? "";
  // PDFs and other formats aren't read yet; HTML only.
  if (!res.ok || !res.text || (type && !/html|xml|text\/plain/i.test(type))) return null;
  const text = htmlToText(res.text).slice(0, MAX_DOC_CHARS);
  if (text.length < 200) return null;
  const title = htmlTitle(res.text) ?? url;
  const host = new URL(res.finalUrl).hostname;
  const row = {
    url,
    canonical_url: res.finalUrl !== url ? res.finalUrl : null,
    source_type: meta.official ? "official" : "campaign",
    trust_tier: meta.official ? "official" : "standard",
    publisher: meta.publisher ?? host,
    title,
    content_text: text,
    raw_hash: sha(text),
    fetched_at: now.toISOString(),
    status: "active",
  };
  const { data, error } = await db.from("sources").upsert(row, { onConflict: "url" }).select("id").single();
  if (error || !data) return null;
  return { url, html: res.text, text, title, sourceId: data.id, fetchedAt: row.fetched_at };
}

/** The target's pages plus up to MAX_FOLLOW same-site pages they link to by the wanted link texts. */
async function gatherDocuments(deps: ResearchDeps, t: Target, now: Date): Promise<FetchedDoc[]> {
  const got: Fetched[] = [];
  const seen = new Set<string>();
  const metaFor = (official: boolean, publisher?: string) => ({ official, publisher });
  const followQueue: { url: string; official: boolean; publisher?: string }[] = [];
  for (const p of t.pages) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    const d = await getDocument(deps, p.url, metaFor(p.official, p.publisher), now);
    if (!d) continue;
    got.push(d);
    // Links are only discovered on a fresh fetch; a stored copy is reused as is.
    if (d.html && t.follow.length) for (const u of findLinks(d.html, d.url, t.follow)) followQueue.push({ url: u, official: p.official, publisher: p.publisher });
  }
  // On a reused stored copy, keep following the pages found last time.
  if (!followQueue.length && t.follow.length) {
    const { data: prior } = await deps.db
      .from("synthesis_runs")
      .select("metadata")
      .eq("target_type", t.targetType)
      .eq("target_id", t.targetId)
      .eq("field_name", t.field)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const urls = ((prior?.metadata as { followed?: string[] } | null)?.followed ?? []).slice(0, MAX_FOLLOW);
    for (const u of urls) followQueue.push({ url: u, official: t.pages[0]?.official ?? false, publisher: t.pages[0]?.publisher });
  }
  for (const f of followQueue.slice(0, MAX_FOLLOW)) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    const d = await getDocument(deps, f.url, metaFor(f.official, f.publisher), now);
    if (d) got.push(d);
  }
  let total = 0;
  const docs: FetchedDoc[] = [];
  for (const d of got) {
    if (total >= MAX_TOTAL_CHARS) break;
    const text = d.text.slice(0, MAX_TOTAL_CHARS - total);
    total += text.length;
    const official = t.pages.find((p) => p.url === d.url)?.official ?? followQueue.find((f) => f.url === d.url)?.official ?? false;
    docs.push({
      id: `D${docs.length + 1}`,
      sourceId: d.sourceId,
      text,
      meta: { url: d.url, title: d.title, publisher: t.pages[0]?.publisher ?? new URL(d.url).hostname, official, fetchedAt: d.fetchedAt },
    });
  }
  return docs;
}

const followedUrls = (t: Target, docs: FetchedDoc[]) => docs.map((d) => d.meta.url).filter((u) => !t.pages.some((p) => p.url === u));

function inputHash(t: Target, model: string, docs: FetchedDoc[]): string {
  const parts = docs.map((d) => `${d.meta.url}:${sha(d.text)}`).sort();
  return sha([t.field, t.kind, t.label, model, PROMPT_VERSION, ...parts].join("\n"));
}

async function alreadyDone(db: Db, t: Target, hash: string): Promise<boolean> {
  const { data } = await db
    .from("synthesis_runs")
    .select("id")
    .eq("target_type", t.targetType)
    .eq("target_id", t.targetId)
    .eq("field_name", t.field)
    .eq("input_hash", hash)
    .eq("status", "succeeded")
    .limit(1);
  return !!data?.length;
}

async function researchOne(deps: ResearchDeps, cfg: AiConfig, t: Target, docs: FetchedDoc[], hash: string, now: Date) {
  const { db } = deps;
  const { data: run } = await db
    .from("synthesis_runs")
    .insert({
      target_type: t.targetType,
      target_id: t.targetId,
      field_name: t.field,
      trigger_type: "scheduled",
      status: "running",
      model: cfg.model,
      prompt_version: PROMPT_VERSION,
      source_ids: docs.map((d) => d.sourceId),
      input_hash: hash,
      started_at: now.toISOString(),
      metadata: { followed: followedUrls(t, docs) } as Json,
    })
    .select("id")
    .single();
  const runId = run?.id ?? null;

  const modelDocs: Doc[] = docs.map((d) => ({ id: d.id, title: d.meta.title, url: d.meta.url, text: d.text }));
  const isMeasure = t.kind === "measure";
  const first = isMeasure
    ? await extract({ model: cfg.model, schema: MeasureResearch, task: taskFor(t), docs: modelDocs, client: deps.client })
    : await extract({ model: cfg.model, schema: PersonResearch, task: taskFor(t), docs: modelDocs, client: deps.client });
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
          metadata: { followed: followedUrls(t, docs), costMicroUsd: spent, usage: first.usage ?? null, ...extra } as Json,
        })
        .eq("id", runId);
    }
  };

  if (!first.data) {
    await finish("failed", {}, first.problem);
    return { outcome: "failed" as const, spent };
  }

  const screened = isMeasure ? screenMeasure(first.data as MeasureResearch, docs) : screenPerson(first.data as PersonResearch, docs);
  const support = await checkSupport({ model: cfg.checkModel, claims: screened.pending.map((p: Pending) => ({ text: p.text, quote: p.quote })), client: deps.client });
  spent += support.costMicroUsd;
  const built = buildPayload(
    isMeasure ? "measure" : "person",
    screened.pending,
    support.supported,
    docs,
    isMeasure ? [] : (first.data as PersonResearch).pastPositions,
  );
  const rejected = [...screened.rejected, ...built.rejected];
  const empty = payloadIsEmpty(built.payload);
  const status = empty ? "held" : "published";
  const heldReason = empty ? (rejected.length ? `every answer failed a check (${[...new Set(rejected.map((r) => r.reason))].join(", ")})` : "documents had no answers") : null;

  await db.from("synthesized_field_versions").update({ is_current: false }).eq("target_type", t.targetType).eq("target_id", t.targetId).eq("field_name", t.field).eq("is_current", true);
  const content = JSON.stringify(built.payload);
  await db.from("synthesized_field_versions").insert({
    synthesis_run_id: runId,
    target_type: t.targetType,
    target_id: t.targetId,
    field_name: t.field,
    content,
    payload: built.payload as unknown as Json,
    source_ids: built.sourceIds,
    is_current: true,
    status,
    held_reason: heldReason,
  });
  await finish("succeeded", { rejected, supportProblem: support.problem ?? null, output_hash: sha(content) });
  return { outcome: status, spent };
}

export async function runResearch(deps: ResearchDeps): Promise<ResearchSummary> {
  const cfg = deps.config ?? aiConfig();
  const now = deps.now ?? new Date();
  const until = Date.now() + (deps.budgetMs ?? 240_000);
  const limit = deps.limit ?? 20;
  const budgetMicro = Math.floor(cfg.monthlyBudgetUsd * 1_000_000);
  const all = buildTargets(await loadContests(deps.db, deps.electionId));
  const targets = deps.only?.length ? all.filter((t) => deps.only!.includes(t.targetId)) : all;
  const s: ResearchSummary = { targets: targets.length, considered: 0, unchanged: 0, noDocuments: 0, researched: 0, published: 0, held: 0, failed: 0, spentMicroUsd: 0 };
  let spentBefore = await monthSpend(deps.db, now);
  const queue = [...targets];
  let stop: ResearchSummary["stoppedBy"];

  // A few targets at a time; each worker re-checks time, item cap and budget before calling Claude.
  const worker = async () => {
    while (queue.length && !stop) {
      if (Date.now() > until) {
        stop = "time";
        break;
      }
      const t = queue.shift()!;
      s.considered++;
      const docs = await gatherDocuments(deps, t, now);
      if (!docs.length) {
        s.noDocuments++;
        continue;
      }
      const hash = inputHash(t, cfg.model, docs);
      if (await alreadyDone(deps.db, t, hash)) {
        s.unchanged++;
        continue;
      }
      if (s.researched >= limit) {
        stop = "limit";
        break;
      }
      if (spentBefore + s.spentMicroUsd >= budgetMicro) {
        stop = "budget";
        break;
      }
      s.researched++;
      const r = await researchOne(deps, cfg, t, docs, hash, now);
      s.spentMicroUsd += r.spent;
      if (r.outcome === "published") s.published++;
      else if (r.outcome === "held") s.held++;
      else s.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (stop) s.stoppedBy = stop;
  spentBefore += s.spentMicroUsd;
  logEvent("research.run", { ...s, monthSpentUsd: Math.round(spentBefore / 10_000) / 100 });
  return s;
}
