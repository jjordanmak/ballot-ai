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
 *   → offices: Claude extracts answers with exact quotes; quotes must be in
 *     the cited document, wording passes the lint, a second call confirms
 *     each quote supports its sentence
 *   → races, people, measures: Claude writes the sections (write.ts); every
 *     sentence's excerpts, hard facts, meaning and wording are checked, one
 *     repair pass, and a race's candidates get a fairness pass
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
import { aiConfig, ROUND_CONFIG, settingId, type AiConfig, type Setting } from "@/lib/ai/config";
import { checkSupport, extract, PROMPT_VERSION, type CallResult, type Doc } from "@/lib/ai/extract";
import { OfficeResearch } from "@/lib/ai/schemas";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { billingPeriod } from "@/lib/usage/quota";
import type { Resolver } from "@/lib/feeds/safeFetch";
import { logEvent } from "@/lib/observability/log";
import { focusText, getDocument, REREAD_AFTER_MS, type Fetched, type FetchDeps } from "./fetch";
import { ballotpediaCampaignSite, isBallotpedia, isGov, isVettedNews, isWikipedia, searchUrls } from "./search";
import { buildTargets, ENDORSEMENT_FOLLOW, pdfHostOk, taskFor, type ContestRow, type Target, type TargetPage } from "./targets";
import { findLinkEntries } from "./text";
import { TIER_RANK } from "./person";
import { buildPayload, payloadIsEmpty, screenOffice, type FetchedDoc, type Payload, type Rejection, type SourceTier } from "./verify";
import { runSet } from "./runSet";
import type { PersonPayloadV3 } from "./synthesis";
import { parityPass, writeItem, type FindSources } from "./write";

type Db = SupabaseClient<Database>;

const SPEND_METRIC = "anthropic.microusd";
const MAX_DOC_CHARS = 60_000;
/** A news article is narrowed to the passages about the target, so several fit alongside the official pages. */
const MAX_NEWS_CHARS = 15_000;
const MAX_TOTAL_CHARS = 240_000; // ~60K tokens: under Haiku's 100K-token price tier
/** Articles the news feed matched to a race or candidate (round 2, owner 2026-10-30): newest first, this recent. */
const FEED_ARTICLES = { race: 4, person: 3 } as const;
const FEED_WINDOW_DAYS = 75;
/**
 * The document set's version: bump it to gather every set again. A set from
 * SEARCH_QUERY_VERSION on keeps its search results (the queries haven't
 * changed since); round 3 (v3) follows campaign endorsement pages.
 */
const SEARCH_VERSION = 3;
/** Bump when the search queries change, so the search itself runs again instead of reusing last week's results. */
const SEARCH_QUERY_VERSION = 2;
/** The source finder reads at most this many pages, each narrowed to the sentences it looks for. */
const FINDER = { pages: 3, chars: 8000 } as const;
const MAX_FOLLOW = 4;
const SEARCH_TTL_MS = 7 * 24 * 3600_000;
const RECHECK_MS = 6 * 3600_000;
const COMPARE_RECHECK_MS = 7 * 24 * 3600_000;
/** Writing rounds re-use the pages read in round 1 instead of reading them again (WRITING_PIPELINE_PLAN.md). */
const ROUND_REREAD_MS = 14 * 24 * 3600_000;
/** A race intro waits this many times (2 minutes apart) for its candidates' results, then runs with what's there. */
const MAX_RACE_WAITS = 30;
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
  /** Compare mode's items (default: the round's run set, src/data/research/round.json). */
  compareKeys?: string[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function loadContests(db: Db, electionId: string): Promise<ContestRow[]> {
  const out: ContestRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("contests")
      .select("id, kind, contest_type, title, division_key, divisions(name, state, scope), contest_candidates(id, ballot_name, display_name, campaign_url, party, designation)")
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

/** The jobs for this mode: compare = the round's run set × every setting; publish = every target × its kind's setting. */
export function jobsFor(cfg: AiConfig, targets: Target[], election: string, compareKeys: string[] = runSet(ROUND_CONFIG.runSet).targets.map((t) => t.key)): Job[] {
  if (cfg.mode === "compare") {
    const wanted = new Set(compareKeys);
    return targets
      .filter((t) => wanted.has(t.key))
      .flatMap((t) => cfg.compare.map((setting) => ({ stateKey: `${t.key}@${settingId(setting)}`, target: t, setting, compare: true, election })));
  }
  return targets.map((t) => ({
    stateKey: t.key,
    target: t,
    setting: cfg.publish[t.field === "measure" ? "measure" : t.field === "office" ? "office" : t.field === "race" ? "race" : "profile"],
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
  /** SEARCH_VERSION the search ran under. */
  v?: number;
  urls: string[];
  campaign?: string | null;
  followed?: string[];
  /** When the search ran (kept a week). */
  searchedAt?: string;
  /** Pages Wikipedia's references pointed to (Wikipedia is a finder only). */
  refs?: string[];
  /** When the document set was last gathered (shared while the stored pages are fresh). */
  at: string;
  /** Articles the news feed matched to this target, when the set was gathered (every setting reads the same ones). */
  feed?: { url: string; publisher: string }[];
  /** The campaign site's endorsement pages (round 3). */
  campaignPages?: string[];
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
  maxAgeMs = REREAD_AFTER_MS,
): Promise<{ cache: SearchCache | null; owner: boolean; cost: number; wait?: boolean }> {
  const key = `${t.key}#search`;
  const { db, now } = deps;
  const { data: row } = await db.from("research_state").select("discovered, locked_until").eq("key", key).maybeSingle();
  const cached = row?.discovered as SearchCache | null | undefined;
  const current = (cached?.v ?? 1) >= SEARCH_VERSION;
  if (cached && current && now.getTime() - Date.parse(cached.at) < maxAgeMs) return { cache: cached, owner: false, cost: 0 };
  // Another setting's job is gathering right now: try again shortly.
  if (row?.locked_until && Date.parse(row.locked_until) > now.getTime()) return { cache: null, owner: false, cost: 0, wait: true };
  await db
    .from("research_state")
    .upsert({ key, target: { kind: "documents", of: t.key } as Json, next_check_at: "2999-01-01T00:00:00Z", locked_until: new Date(now.getTime() + SHARED_LOCK_MS).toISOString() }, { onConflict: "key" });
  const searchedAt = cached?.searchedAt ?? cached?.at;
  const queriesCurrent = (cached?.v ?? 1) >= SEARCH_QUERY_VERSION;
  if (!t.search || (cached && searchedAt && queriesCurrent && now.getTime() - Date.parse(searchedAt) < SEARCH_TTL_MS)) {
    return { cache: cached ?? null, owner: true, cost: 0 };
  }
  const res = await searchUrls({ kind: t.search.kind, query: t.search.query, mustMention: t.search.mustMention, client: deps.client });
  return { cache: { v: cached?.v, urls: res.urls, campaign: cached?.campaign ?? null, followed: cached?.followed ?? [], searchedAt: now.toISOString(), at: now.toISOString() }, owner: true, cost: res.costMicroUsd };
}

async function releaseShared(db: Db, t: Target, now: Date, cache: SearchCache | null) {
  await db
    .from("research_state")
    .update({ ...(cache ? { discovered: cache as unknown as Json } : {}), locked_until: null, updated_at: now.toISOString() })
    .eq("key", `${t.key}#search`);
}

const isGovHost = (u: string) => /(^|\.)gov$/i.test(new URL(u).hostname);

/** A document's place in the trust order (owner, 2026-10-29). */
function tierFor(url: string, official: boolean): SourceTier {
  const h = new URL(url).hostname;
  if (official || isGov(h)) return "official";
  if (isBallotpedia(h)) return "ballotpedia";
  if (isVettedNews(h)) return "news";
  return "campaign";
}

/** Wikipedia is a finder only: the official, Ballotpedia or vetted-news pages its references cite. */
function wikipediaReferences(html: string, mustMention: string[]): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*class="[^"]*\bexternal\b[^"]*"[^>]*href="(https?:\/\/[^"]+)"/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"));
      const h = u.hostname;
      if (isWikipedia(h) || !(isGov(h) || isVettedNews(h) || (isBallotpedia(h) && mustMention.every((n) => u.pathname.toLowerCase().includes(n.toLowerCase()))))) continue;
      u.hash = "";
      if (!out.includes(u.toString())) out.push(u.toString());
    } catch {
      // ignore malformed links
    }
  }
  return out.slice(0, 3);
}

/** Which documents fill the budget first: official, Ballotpedia, the campaign's own pages, then news. */
const INCLUDE_ORDER: Record<SourceTier, number> = { official: 0, ballotpedia: 1, campaign: 2, news: 3 };

/**
 * The newest articles the news feed matched to this race or person (published,
 * vetted outlets, recent). Read-only: the feed's own tables (src/lib/feeds/).
 * Measures stay official-only (CLAUDE.md), so they get none.
 */
async function feedArticles(db: Db, t: Target, now: Date): Promise<{ url: string; publisher: string }[]> {
  const column = t.kind === "race" ? "contest_ids" : t.kind === "candidate" || t.kind === "retention" ? "candidate_ids" : null;
  if (!column) return [];
  const since = new Date(now.getTime() - FEED_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("feed_items")
    .select("url, publisher")
    .eq("type", "news")
    .eq("status", "published")
    .contains(column, [t.targetId])
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(t.kind === "race" ? FEED_ARTICLES.race : FEED_ARTICLES.person);
  if (error) {
    logEvent("research.feed_read_failed", { error: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({ url: r.url, publisher: r.publisher }));
}

export interface Tried {
  url: string;
  outcome: string;
}

/** Every document for a target, politely fetched; long ones narrowed to the passages about it. */
async function gatherDocuments(
  deps: ResearchDeps & { now: Date },
  t: Target,
  cache: SearchCache | null,
  owner = true,
  maxAgeMs = REREAD_AFTER_MS,
): Promise<{ docs: FetchedDoc[]; campaign?: string | null; followed: string[]; refs: string[]; feed: { url: string; publisher: string }[]; campaignPages: string[]; busy: number; tried: Tried[] }> {
  const fdeps: FetchDeps = { db: deps.db, now: deps.now, fetchImpl: deps.fetchImpl, resolve: deps.resolve, sleep: deps.sleep };
  const got: { f: Fetched; page: TargetPage }[] = [];
  const seen = new Set<string>();
  const tried: Tried[] = [];
  let campaign = cache?.campaign ?? null;
  const followed: string[] = [];
  let refs: string[] = cache?.refs ?? [];
  let busy = 0;
  const read = async (page: TargetPage, needHtml = false, finder = false) => {
    if (seen.has(page.url)) return null;
    seen.add(page.url);
    const tier = tierFor(page.url, page.official);
    const r = await getDocument(
      fdeps,
      page.url,
      { official: page.official, publisher: page.publisher, allowPdf: page.allowPdf, sourceType: finder ? "finder" : tier === "ballotpedia" ? "civic" : tier },
      needHtml ? 0 : maxAgeMs,
      { needHtml },
    );
    if ("skipped" in r) {
      if (r.skipped === "busy") busy++;
      tried.push({ url: page.url, outcome: r.skipped });
      return null;
    }
    tried.push({ url: page.url, outcome: finder ? "read (finder only)" : "read" });
    if (!finder) got.push({ f: r, page });
    return r;
  };

  // 1. Registry pages (official guides, county page, campaign site from an official filing), and the links they point to.
  const follow: TargetPage[] = [];
  // The job gathering the shared set reads the pages afresh when it has no list of links to follow yet (or an older set's list).
  const stale = (cache?.v ?? 1) < SEARCH_VERSION;
  const needHtml = owner && t.follow.length > 0 && (!cache?.followed?.length || stale);
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

  // 2. Search results: .gov pages; for people, also their Ballotpedia page, vetted news, and Wikipedia's references.
  for (const u of cache?.urls ?? []) {
    const h = new URL(u).hostname;
    if (isWikipedia(h)) {
      if (refs.length) continue;
      const w = await read({ url: u, official: false, publisher: "Wikipedia" }, owner, true);
      if (w?.html) refs = wikipediaReferences(w.html, t.search?.mustMention ?? []);
      continue;
    }
    const r = await read({ url: u, official: isGovHost(u), publisher: h, allowPdf: pdfHostOk(t.state, u) });
    // Ballotpedia names the campaign website; that's the only way a searched campaign site is used.
    if (r?.html && isBallotpedia(h)) campaign = ballotpediaCampaignSite(r.html) ?? campaign;
  }
  for (const u of refs) await read({ url: u, official: isGovHost(u), publisher: new URL(u).hostname });
  // The campaign site, and its endorsement pages (round 3): the campaign's own list, for the Endorsements section.
  let campaignPages: string[] = stale ? [] : cache?.campaignPages ?? [];
  if (campaign && t.kind === "candidate") {
    const home = await read({ url: campaign, official: false }, owner && (stale || !cache?.campaignPages));
    if (home?.html && owner) campaignPages = findLinkEntries(home.html, home.url, ENDORSEMENT_FOLLOW).map((l) => l.url).slice(0, 2);
    for (const u of campaignPages) await read({ url: u, official: false });
  }

  // 3. News coverage the feed already matched to this race or person (vetted outlets only; never for measures).
  const feed = cache?.feed && !owner ? cache.feed : owner ? await feedArticles(deps.db, t, deps.now) : cache?.feed ?? [];
  for (const a of feed) await read({ url: a.url, official: false, publisher: a.publisher });

  // Official first, then Ballotpedia, the campaign's own pages, then news (so a long official guide can't crowd out the
  // campaign site); long documents narrowed to this target, news articles more tightly.
  let total = 0;
  const docs: FetchedDoc[] = [];
  const ranked = got
    .map((g) => ({ ...g, tier: tierFor(g.f.url, g.page.official) }))
    .sort((x, y) => INCLUDE_ORDER[x.tier] - INCLUDE_ORDER[y.tier]);
  for (const { f, page, tier } of ranked) {
    if (total >= MAX_TOTAL_CHARS) break;
    const text = focusText(f.text, t.focus, Math.min(tier === "news" ? MAX_NEWS_CHARS : MAX_DOC_CHARS, MAX_TOTAL_CHARS - total));
    total += text.length;
    docs.push({
      id: `D${docs.length + 1}`,
      sourceId: f.sourceId,
      text,
      meta: { url: f.url, title: f.title, publisher: page.publisher ?? new URL(f.url).hostname, official: tier === "official", fetchedAt: f.fetchedAt, tier },
    });
  }
  return { docs, campaign, followed, refs, feed, campaignPages, busy, tried };
}

/** Words worth narrowing a found page to: the sentences' names and longer words, and the target's own. */
function finderTerms(t: Target, claims: string[]): string[] {
  const words = claims.flatMap((c) => c.match(/\b[A-Z][\p{L}'-]{3,}\b/gu) ?? []);
  return [...new Set([...t.focus, ...words])].slice(0, 20);
}

/**
 * The source finder (owner, 2026-10-30): one search for the sentences an
 * item's documents didn't support, then those pages read politely and
 * narrowed to them. Only .gov, Ballotpedia and vetted news are kept
 * (search.ts); write.ts checks every sentence against them like any source.
 * The query is the model's own sentences about public candidates and races:
 * never an address or anything from a visitor.
 */
function sourceFinder(deps: ResearchDeps & { now: Date }, t: Target, have: FetchedDoc[]): FindSources {
  const fdeps: FetchDeps = { db: deps.db, now: deps.now, fetchImpl: deps.fetchImpl, resolve: deps.resolve, sleep: deps.sleep };
  const known = new Set(have.map((d) => d.meta.url));
  return async (claims) => {
    const res = await searchUrls({ kind: "claim", query: claims.map((c, i) => `${i + 1}. ${c}`).join("\n"), maxUses: 1, client: deps.client });
    const tried: Tried[] = [];
    const docs: FetchedDoc[] = [];
    for (const url of res.urls.filter((u) => !known.has(u)).slice(0, FINDER.pages)) {
      const official = isGovHost(url);
      const tier = tierFor(url, official);
      const r = await getDocument(fdeps, url, { official, publisher: new URL(url).hostname, sourceType: tier === "ballotpedia" ? "civic" : tier });
      if ("skipped" in r) {
        tried.push({ url, outcome: r.skipped });
        continue;
      }
      tried.push({ url, outcome: "read (source finder)" });
      docs.push({
        id: "",
        sourceId: r.sourceId,
        text: focusText(r.text, finderTerms(t, claims), FINDER.chars),
        meta: { url: r.url, title: r.title, publisher: new URL(r.url).hostname, official: tier === "official", fetchedAt: r.fetchedAt, tier },
      });
    }
    return { docs, spent: res.costMicroUsd, tried };
  };
}

function inputHash(t: Target, setting: Setting, docs: FetchedDoc[], extra: string[] = []): string {
  const parts = docs.map((d) => `${d.meta.url}:${sha(d.text)}`).sort();
  return sha([t.key, t.label, settingId(setting), PROMPT_VERSION, ...parts, ...extra].join("\n"));
}

interface RaceCandidate {
  target: string;
  label: string;
  payload: PersonPayloadV3;
  hash: string;
}

/** A race's candidates' current results for this setting (the fairness pass reads them). */
async function raceCandidates(db: Db, t: Target & { compare: boolean }, setting: Setting): Promise<RaceCandidate[]> {
  const ids = t.candidateIds ?? [];
  if (!ids.length) return [];
  const field = t.compare ? `profile@${settingId(setting)}` : "profile";
  const { data } = await db
    .from("synthesized_field_versions")
    .select("target_id, content, payload")
    .eq("target_type", "candidate")
    .in("target_id", ids)
    .eq("field_name", field)
    .eq("is_current", true);
  const names = new Map(ids.map((id, i) => [id, t.candidateNames?.[i] ?? id]));
  return (data ?? [])
    .filter((r) => (r.payload as { v?: number } | null)?.v === 3)
    .map((r) => ({ target: r.target_id, label: names.get(r.target_id) ?? r.target_id, payload: r.payload as unknown as PersonPayloadV3, hash: sha(r.content ?? "") }))
    .sort((a, b) => ids.indexOf(a.target) - ids.indexOf(b.target));
}

const transient = (problem?: string) => !!problem && /^api_(429|500|502|503|529|error)(:|$)|^error$/.test(problem);

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

  // A race intro's fairness pass needs its candidates' results first.
  let candidates: RaceCandidate[] = [];
  if (t.kind === "race") {
    candidates = await raceCandidates(db, stored, setting);
    const waits = state.failures ?? 0;
    if (candidates.length < (t.candidateIds?.length ?? 0) && waits < MAX_RACE_WAITS) {
      await finishState(db, stateKey, now, { outcome: "waiting", afterMs: 2 * 60_000, failures: waits + 1 });
      return { key: stateKey, outcome: "waiting", spentMicroUsd: 0 };
    }
  }
  const maxAge = stored.compare ? ROUND_REREAD_MS : REREAD_AFTER_MS;
  const shared = await prepareShared(d, t, maxAge);
  spent += shared.cost;
  if (shared.wait) {
    await finishState(db, stateKey, now, { outcome: "waiting", afterMs: 60_000, failures: state.failures });
    return { key: stateKey, outcome: "waiting", spentMicroUsd: spent };
  }
  const { docs, campaign, followed, refs, feed, campaignPages, busy, tried } = await gatherDocuments(d, t, shared.cache, shared.owner, maxAge);
  await recordSpend(db, now, shared.cost);
  // A site was too busy to read right now: wait and try again rather than run on fewer documents
  // (after a few tries, run with what's there).
  const busyWaits = t.kind === "race" ? 0 : state.failures ?? 0;
  if (busy && busyWaits < MAX_BUSY_WAITS) {
    // Keep the search; mark the document set stale so the next job gathers it again.
    if (shared.owner) await releaseShared(db, t, now, shared.cache ? { ...shared.cache, searchedAt: shared.cache.searchedAt ?? shared.cache.at, at: new Date(0).toISOString() } : null);
    await finishState(db, stateKey, now, { outcome: "waiting", afterMs: 60_000 + Math.floor(Math.random() * 60_000), failures: busyWaits + 1 });
    return { key: stateKey, outcome: "waiting", spentMicroUsd: spent };
  }
  if (shared.owner) {
    await releaseShared(db, t, now, {
      v: SEARCH_VERSION,
      feed,
      urls: shared.cache?.urls ?? [],
      campaign,
      followed: followed.length ? followed : shared.cache?.followed ?? [],
      refs,
      campaignPages,
      searchedAt: shared.cache?.searchedAt ?? shared.cache?.at,
      at: now.toISOString(),
    });
  }
  if (!docs.length) {
    await finishState(db, stateKey, now, { outcome: "no documents", afterMs: RECHECK_MS });
    return { key: stateKey, outcome: "no documents", spentMicroUsd: spent };
  }
  const hash = inputHash(t, setting, docs, candidates.map((c) => `${c.target}:${c.hash}`));
  if (hash === state.input_hash) {
    await finishState(db, stateKey, now, { outcome: "unchanged", hash, afterMs: stored.compare ? COMPARE_RECHECK_MS : RECHECK_MS });
    return { key: stateKey, outcome: "unchanged", spentMicroUsd: spent };
  }
  if ((await monthSpend(db, now)) >= Math.floor(cfg.monthlyBudgetUsd * 1_000_000)) {
    await finishState(db, stateKey, now, { outcome: "budget", afterMs: 3600_000, failures: state.failures });
    return { key: stateKey, outcome: "budget", spentMicroUsd: spent };
  }

  const r = await researchOne(d, cfg, stored, setting, docs, hash, tried, candidates);
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
  tried: Tried[],
  candidates: RaceCandidate[] = [],
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

  if (t.kind !== "office") return synthesizeOne(deps, cfg, t, setting, docs, tried, candidates, { runId, field, started });

  // Offices: what the office does, as quoted answers (not part of the writing rounds).
  const modelDocs: Doc[] = docs.map((d) => ({ id: d.id, title: d.meta.title, url: d.meta.url, text: d.text }));
  const first: CallResult<unknown> = await extract({ model: setting.model, effort: setting.effort, task: taskFor(t), docs: modelDocs, client: deps.client, schema: OfficeResearch });
  let spent = first.costMicroUsd;
  const usage: unknown[] = [first.usage ?? null];

  const finish = async (status: "succeeded" | "failed", extra: Record<string, unknown>, error?: string) => {
    await recordSpend(db, now, spent);
    if (runId) {
      await db
        .from("synthesis_runs")
        .update({
          status,
          error: error ?? null,
          completed_at: new Date().toISOString(),
          metadata: {
            setting,
            compare: t.compare,
            costMicroUsd: spent,
            seconds: Math.round((Date.now() - started) / 100) / 10,
            usage: sumUsage(usage),
            raw: first.data ?? null,
            documents: docs.map((d) => ({ id: d.id, url: d.meta.url, tier: d.meta.tier ?? null })),
            tried,
            ...extra,
          } as unknown as Json,
        })
        .eq("id", runId);
    }
  };

  if (!first.data) {
    await finish("failed", {}, first.problem);
    return { outcome: "failed", spent, problem: first.problem };
  }

  // Prose claims get the AI support check; in compare mode the other checker settings judge the same claims, for calibration.
  const screened = screenOffice(first.data as OfficeResearch, docs);
  const claims = screened.pending.map((p) => ({ text: p.text, quote: p.quote }));
  const support = await checkSupport({ model: cfg.checkModel, effort: cfg.checkEffort, claims, client: deps.client });
  spent += support.costMicroUsd;
  const calibration: Record<string, boolean[]> = {};
  if (t.compare && claims.length) {
    for (const c of cfg.checkCompare) {
      const r = await checkSupport({ model: c.model, effort: c.effort, claims, client: deps.client });
      spent += r.costMicroUsd;
      calibration[settingId(c)] = r.supported;
    }
  }
  const built = buildPayload("office", screened.pending, support.supported, docs);
  const payloadCore: Payload = built.payload;
  const sourceIds = built.sourceIds;
  const rejected: Rejection[] = [...screened.rejected, ...built.rejected];
  const extra = { supportProblem: support.problem ?? null, calibration, claims: t.compare ? screened.pending.map((p) => ({ field: p.field, text: p.text, quote: p.quote })) : undefined };

  const stored = await storeVersion(db, t, field, runId, payloadCore, sourceIds, rejected);
  await finish("succeeded", { rejected, ...extra, output_hash: stored.outputHash });
  return { outcome: t.compare ? "compared" : stored.status, spent };
}

/** The current version of a field: compare mode and empty results are held; the previous version stops being current. */
async function storeVersion(db: Db, t: Target & { compare: boolean; election: string }, field: string, runId: string | null, payloadCore: Payload, sourceIds: string[], rejected: Rejection[]) {
  const empty = payloadIsEmpty(payloadCore);
  const payload: Payload = { ...payloadCore, ...(t.state ? { scope: { election: t.election, state: t.state } } : {}) };
  const status: "held" | "published" = t.compare || empty ? "held" : "published";
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
    source_ids: sourceIds,
    is_current: true,
    status,
    held_reason: heldReason,
  });
  return { status, outputHash: sha(content) };
}

/** Races, people and measures: written prose, every sentence checked (write.ts); races add the fairness pass. */
async function synthesizeOne(
  deps: ResearchDeps & { now: Date },
  cfg: AiConfig,
  t: Target & { compare: boolean; election: string },
  setting: Setting,
  docs: FetchedDoc[],
  tried: Tried[],
  candidates: RaceCandidate[],
  run: { runId: string | null; field: string; started: number },
): Promise<{ outcome: "published" | "held" | "compared" | "failed"; spent: number; problem?: string }> {
  const { db, now } = deps;
  const w = await writeItem({ cfg, setting, t, docs, now, client: deps.client, electionDate: apDate(deps.electionSlug ?? "2026-11-03"), findSources: sourceFinder(deps, t, docs) });
  let spent = w.spent;
  const usage = [...w.usage];
  let parityProblem: string | undefined;
  if (w.payload?.kind === "race") {
    const missing = (t.candidateIds ?? []).filter((id) => !candidates.some((c) => c.target === id));
    const pp = await parityPass({ cfg, t, candidates, missing, client: deps.client });
    spent += pp.spent;
    usage.push(...pp.usage);
    w.payload.parity = pp.parity;
    parityProblem = pp.problem;
  }
  await recordSpend(db, now, spent);
  const metadata = (extra: Record<string, unknown>) =>
    ({
      setting,
      compare: t.compare,
      costMicroUsd: spent,
      seconds: Math.round((Date.now() - run.started) / 100) / 10,
      usage: sumUsage(usage),
      raw: w.raw,
      documents: docs.map((d) => ({ id: d.id, url: d.meta.url, tier: d.meta.tier ?? null })),
      tried,
      rejected: w.rejected,
      ...w.extra,
      ...extra,
    }) as unknown as Json;
  // A failed parity review must not publish an unreviewed race: fail and retry.
  const problem = w.payload ? parityProblem : w.problem;
  if (!w.payload || problem) {
    if (run.runId) await db.from("synthesis_runs").update({ status: "failed", error: problem ?? null, completed_at: new Date().toISOString(), metadata: metadata({}) }).eq("id", run.runId);
    return { outcome: "failed", spent, problem };
  }
  const stored = await storeVersion(db, t, run.field, run.runId, w.payload, w.sourceIds, w.rejected);
  if (run.runId) await db.from("synthesis_runs").update({ status: "succeeded", error: null, completed_at: new Date().toISOString(), metadata: metadata({ output_hash: stored.outputHash }) }).eq("id", run.runId);
  return { outcome: t.compare ? "compared" : stored.status, spent };
}

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** "2026-11-03" → "Nov. 3, 2026" (AP style). */
export function apDate(slug: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(slug);
  return m ? `${AP_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : slug;
}

/** Token counts across the calls of one run. */
function sumUsage(list: unknown[]): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const u of list) {
    if (!u || typeof u !== "object") continue;
    for (const [k, v] of Object.entries(u as Record<string, unknown>)) if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
  }
  return Object.keys(out).length ? out : null;
}
