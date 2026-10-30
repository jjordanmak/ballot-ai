/**
 * One pass of news-by-name (owner, 2026-10-30): for the tracked candidates
 * asked about longest ago, query the New York Times Article Search API and
 * GDELT (for outlets whose pages we can't read), and store what they find
 * like any feed item, under the outlet's own source key.
 *
 * Pace: GDELT allows one request every 5 seconds (and throttles shared
 * cloud addresses hard), the NYT about 10 a minute and 4,000 a day. So each
 * run asks GDELT about 2 races, one search per race, and the NYT about 5
 * people (statewide, federal and legislative only: it's a national paper),
 * 12 s apart, in parallel. Statewide races come first, then other
 * state-level ones, then local; within a tier, the one asked longest ago
 * (feed_source_state rows "gdelt:race:<contest>" and "nyt:<candidate>").
 * Any refusal from GDELT (429, a non-JSON body or its "slow down" note)
 * ends its loop and pauses it 10 minutes, doubling up to 2 hours
 * ("gdelt:_backoff"). Never touches an address.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { gdeltRaceQuery, gdeltUrl, isGdeltThrottle, isOpinionKind, namedInHeadline, nytTagged, nytUrl, parseGdelt, parseNyt, raceQueries, type ApiArticle } from "./apis";
import { canonicalUrl } from "./canonical";
import { checkEntry } from "./checks";
import { loadCycle, loadTracked } from "./collect-news";
import { siteOf } from "./discover";
import { buildMatcher, candidateQueries, type CandidateQuery } from "./match";
import { safeFetch, type Resolver } from "./safeFetch";
import type { NewsSource } from "./sources";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];

const GDELT_SPACING_MS = 6_000;
const GDELT_PER_RUN = 2;
const GDELT_TIMEOUT_MS = 10_000;
const BACKOFF_KEY = "gdelt:_backoff";
const BACKOFF_FIRST_MS = 10 * 60_000;
const BACKOFF_MAX_MS = 2 * 3600_000;
const NYT_SPACING_MS = 12_000;
const NYT_PER_RUN = 5;
/** Regular runs look back this far; older coverage in the election cycle is the backfill's job. */
const LOOKBACK_DAYS = 3;
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";
const NYT_KEY = "nyt-politics";
const NYT_NAME = "The New York Times";

export interface ApiSummary {
  gdeltAsked: number;
  gdeltFound: number;
  gdeltThrottled: boolean;
  gdeltSkipped?: string;
  nytAsked: number;
  /** Articles the NYT returned, before our identity checks. */
  nytReturned: number;
  /** Of those, how many the NYT itself tagged with the person. */
  nytTagged: number;
  nytFound: number;
  nytSkipped?: string;
  stored: number;
  published: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The next items to ask about: statewide first, then other state-level, then
 * local; within a tier, the one asked longest ago (never asked first). Each
 * at most once an hour.
 */
export async function nextUp<T extends { tier: 0 | 1 | 2 }>(db: Db, keyOf: (t: T) => string, all: T[], n: number, now: Date): Promise<T[]> {
  const keys = all.map(keyOf);
  const last = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("feed_source_state").select("source_key, last_fetched_at").in("source_key", keys.slice(i, i + 200));
    for (const r of data ?? []) last.set(r.source_key, r.last_fetched_at ? Date.parse(r.last_fetched_at) : 0);
  }
  return all
    .map((t) => ({ t, at: last.get(keyOf(t)) ?? 0 }))
    .filter((x) => now.getTime() - x.at > 3600_000)
    .sort((a, b) => a.t.tier - b.t.tier || a.at - b.at)
    .slice(0, n)
    .map((x) => x.t);
}

export async function collectApiNews(opts: {
  db: Db;
  electionId: string;
  sources: NewsSource[];
  nytKey?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  publish?: boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ApiSummary> {
  const { db, electionId } = opts;
  const now = opts.now ?? new Date();
  const publish = opts.publish ?? true;
  const sleep = opts.sleep ?? wait;
  const summary: ApiSummary = { gdeltAsked: 0, gdeltFound: 0, gdeltThrottled: false, nytAsked: 0, nytReturned: 0, nytTagged: 0, nytFound: 0, stored: 0, published: 0 };
  const tracked = await loadTracked(db, electionId);
  const people = candidateQueries(tracked);
  if (!people.length) return summary;
  const cycle = await loadCycle(db, electionId);
  const match = buildMatcher(tracked);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = new Map<string, FeedInsert>();
  const asked: { source_key: string; last_fetched_at: string; last_status: number | null; last_error: string | null; failures: number; retry_at?: string | null; items_seen?: number }[] = [];

  const add = (a: ApiArticle, src: { key: string; name: string }, on: { contestId: string; candidateIds: string[] }, via: "gdelt" | "nyt-api", terms: string[]) => {
    const link = canonicalUrl(a.link);
    if (!link) return;
    const verdict = checkEntry({ title: a.title, link, categories: a.kind ? [a.kind] : [], published: a.published, summary: a.summary }, now, cycle);
    if (verdict.status === "skip") return;
    const existing = rows.get(link);
    if (existing) {
      existing.contest_ids = [...new Set([...(existing.contest_ids ?? []), on.contestId])];
      existing.candidate_ids = [...new Set([...(existing.candidate_ids ?? []), ...on.candidateIds])];
      return;
    }
    const opinion = isOpinionKind(a.kind);
    const held = verdict.status === "held" ? verdict.reason : opinion ? "opinion or sponsored" : !publish ? "publishing paused" : null;
    rows.set(link, {
      election_id: electionId,
      type: "news",
      source_key: src.key,
      publisher: src.name,
      title: a.title.slice(0, 300),
      excerpt: a.summary ? a.summary.slice(0, 280) : null,
      url: link,
      published_at: (a.published ?? now).toISOString(),
      status: held ? "held" : "published",
      held_reason: held,
      contest_ids: [on.contestId],
      candidate_ids: on.candidateIds,
      match: { terms, via },
    });
  };

  // GDELT: outlets we can't read, by the domain GDELT files them under; one search per race.
  const gdeltSources = opts.sources.filter((s) => s.gdeltDomain);
  const gdeltLoop = async () => {
    const { data: back } = await db.from("feed_source_state").select("failures, retry_at").eq("source_key", BACKOFF_KEY).maybeSingle();
    if (back?.retry_at && Date.parse(back.retry_at) > now.getTime()) {
      summary.gdeltSkipped = "backing off";
      return;
    }
    const queue = await nextUp(db, (r) => `gdelt:race:${r.contestId}`, raceQueries(tracked), GDELT_PER_RUN, now);
    let refused = false;
    for (const [i, r] of queue.entries()) {
      // A state or local outlet only covers its own state's races.
      const srcs = gdeltSources.filter((s) => s.scope === "national" || (!!s.state && s.state === r.state));
      if (!srcs.length) continue;
      if (i > 0) await sleep(GDELT_SPACING_MS);
      summary.gdeltAsked++;
      let status = 0;
      let error: string | null = null;
      try {
        const res = await safeFetch(gdeltUrl(gdeltRaceQuery(r, srcs.map((s) => s.gdeltDomain!)), `${LOOKBACK_DAYS}d`), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) }, { fetchImpl: opts.fetchImpl, resolve: opts.resolve });
        status = res.status;
        const body = res.text ?? "";
        // A refusal is a 429, any non-OK answer, or a body that isn't JSON (GDELT's "slow down" note).
        if (!res.ok || isGdeltThrottle(body) || !/^\s*[{[]/.test(body)) {
          refused = true;
          break;
        }
        for (const a of parseGdelt(body)) {
          const src = srcs.find((s) => a.domain && siteOf(a.domain) === s.gdeltDomain);
          if (!src) continue;
          summary.gdeltFound++;
          add(a, src, { contestId: r.contestId, candidateIds: namedInHeadline(a.title, r) }, "gdelt", r.phrases.map((p) => p.toLowerCase()));
        }
      } catch (e) {
        error = e instanceof Error ? e.name : "fetch failed";
        // A timeout is how a throttled GDELT often answers: treat it as a refusal too.
        refused = true;
      }
      asked.push({ source_key: `gdelt:race:${r.contestId}`, last_fetched_at: now.toISOString(), last_status: status || null, last_error: error, failures: error ? 1 : 0 });
      if (refused) break;
    }
    summary.gdeltThrottled = refused;
    const failures = refused ? (back?.failures ?? 0) + 1 : 0;
    const wait = Math.min(BACKOFF_FIRST_MS * 2 ** Math.max(0, failures - 1), BACKOFF_MAX_MS);
    asked.push({ source_key: BACKOFF_KEY, last_fetched_at: now.toISOString(), last_status: null, last_error: refused ? "refused" : null, failures, retry_at: refused ? new Date(now.getTime() + wait).toISOString() : null });
  };

  // NYT: tagged people first; otherwise the same identity rules as any story text.
  const nytLoop = async () => {
    if (!opts.nytKey) {
      summary.nytSkipped = "no NYT_API_KEY";
      return;
    }
    // A national paper: statewide, federal and legislative candidates, never local races or judges.
    const queue = await nextUp(db, (c) => `nyt:${c.candidateId}`, people.filter((c) => c.tier < 2 && !c.judicial), NYT_PER_RUN, now);
    for (const [i, c] of queue.entries()) {
      if (i > 0) await sleep(NYT_SPACING_MS);
      summary.nytAsked++;
      let status = 0;
      let error: string | null = null;
      let returned = 0;
      try {
        // The key is a query parameter by the API's design; it never appears in logs or stored rows.
        const res = await (opts.fetchImpl ?? fetch)(nytUrl(c, opts.nytKey, since), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) });
        status = res.status;
        if (res.status === 429) {
          error = "rate limited";
        } else if (res.ok) {
          const docs = parseNyt(await res.text());
          returned = docs.length;
          summary.nytReturned += docs.length;
          for (const a of docs) {
            const tagged = nytTagged(a.persons, c);
            if (tagged) summary.nytTagged++;
            const m = tagged ? null : match(a.title, a.summary ?? "", { scope: "national" }, a.body);
            if (!tagged && !m?.candidateIds.includes(c.candidateId)) continue;
            summary.nytFound++;
            add(a, { key: NYT_KEY, name: NYT_NAME }, { contestId: c.contestId, candidateIds: [c.candidateId] }, "nyt-api", tagged ? [`nyt tag: ${c.name.toLowerCase()}`] : (m?.terms ?? []));
          }
        } else {
          error = `HTTP ${res.status}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.name : "fetch failed";
      }
      // items_seen: how many articles the NYT returned for this person, so "found nothing" can be told apart from "nothing passed".
      asked.push({ source_key: `nyt:${c.candidateId}`, last_fetched_at: now.toISOString(), last_status: status || null, last_error: error, failures: error ? 1 : 0, items_seen: returned });
      if (status === 429) break;
    }
  };

  await Promise.all([gdeltLoop(), nytLoop()]);

  // Articles already stored (from an outlet's own feed, or an earlier run) are left as they are.
  const urls = [...rows.keys()];
  for (let i = 0; i < urls.length; i += 50) {
    const { data } = await db.from("feed_items").select("url").in("url", urls.slice(i, i + 50));
    for (const r of data ?? []) rows.delete(r.url);
  }
  const fresh = [...rows.values()];
  if (fresh.length) {
    const { error } = await db.from("feed_items").upsert(fresh, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw new Error(`feed_items insert: ${error.message}`);
  }
  if (asked.length) await db.from("feed_source_state").upsert(asked);
  summary.stored = fresh.length;
  summary.published = fresh.filter((r) => r.status === "published").length;
  logEvent("feeds.apis", { ...summary });
  return summary;
}
