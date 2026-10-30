/**
 * One pass of news-by-name (owner, 2026-10-30): for the tracked candidates
 * asked about longest ago, query the New York Times Article Search API and
 * GDELT (for outlets whose pages we can't read), and store what they find
 * like any feed item, under the outlet's own source key.
 *
 * Pace: GDELT allows one request every 5 seconds and the NYT about 10 a
 * minute and 4,000 a day, so each run asks GDELT about at most 12 people
 * (6 s apart) and the NYT about 5 (12 s apart), in parallel. Every tracked
 * candidate is reached in turn (feed_source_state rows "gdelt:<id>" and
 * "nyt:<id>" hold when each was last asked). A throttle note from GDELT
 * stops its loop for the run. Never touches an address.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { gdeltQuery, gdeltUrl, isGdeltThrottle, isOpinionKind, nytTagged, nytUrl, parseGdelt, parseNyt, type ApiArticle } from "./apis";
import { canonicalUrl } from "./canonical";
import { checkEntry } from "./checks";
import { loadTracked } from "./collect-news";
import { siteOf } from "./discover";
import { buildMatcher, candidateQueries, type CandidateQuery } from "./match";
import { safeFetch, type Resolver } from "./safeFetch";
import type { NewsSource } from "./sources";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];

const GDELT_SPACING_MS = 6_000;
const GDELT_PER_RUN = 12;
const NYT_SPACING_MS = 12_000;
const NYT_PER_RUN = 5;
/** Stories older than this aren't looked for (the feed checks skip anything past 14 days). */
const LOOKBACK_DAYS = 3;
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";
const NYT_KEY = "nyt-politics";
const NYT_NAME = "The New York Times";

export interface ApiSummary {
  gdeltAsked: number;
  gdeltFound: number;
  gdeltThrottled: boolean;
  nytAsked: number;
  nytFound: number;
  nytSkipped?: string;
  stored: number;
  published: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The candidates asked about longest ago (never-asked first) for one API. */
async function nextUp(db: Db, prefix: string, all: CandidateQuery[], n: number, now: Date): Promise<CandidateQuery[]> {
  const keys = all.map((c) => `${prefix}:${c.candidateId}`);
  const last = new Map<string, number>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("feed_source_state").select("source_key, last_fetched_at").in("source_key", keys.slice(i, i + 200));
    for (const r of data ?? []) last.set(r.source_key, r.last_fetched_at ? Date.parse(r.last_fetched_at) : 0);
  }
  // Each person at most once an hour per API.
  return all
    .map((c) => ({ c, at: last.get(`${prefix}:${c.candidateId}`) ?? 0 }))
    .filter((x) => now.getTime() - x.at > 3600_000)
    .sort((a, b) => a.at - b.at)
    .slice(0, n)
    .map((x) => x.c);
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
  const summary: ApiSummary = { gdeltAsked: 0, gdeltFound: 0, gdeltThrottled: false, nytAsked: 0, nytFound: 0, stored: 0, published: 0 };
  const tracked = await loadTracked(db, electionId);
  const people = candidateQueries(tracked);
  if (!people.length) return summary;
  const match = buildMatcher(tracked);
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = new Map<string, FeedInsert>();
  const asked: { source_key: string; last_fetched_at: string; last_status: number | null; last_error: string | null; failures: number }[] = [];

  const add = (a: ApiArticle, src: { key: string; name: string }, c: CandidateQuery, via: "gdelt" | "nyt-api", terms: string[]) => {
    const link = canonicalUrl(a.link);
    if (!link) return;
    const verdict = checkEntry({ title: a.title, link, categories: a.kind ? [a.kind] : [], published: a.published }, now);
    if (verdict.status === "skip") return;
    const existing = rows.get(link);
    if (existing) {
      existing.contest_ids = [...new Set([...(existing.contest_ids ?? []), c.contestId])];
      existing.candidate_ids = [...new Set([...(existing.candidate_ids ?? []), c.candidateId])];
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
      contest_ids: [c.contestId],
      candidate_ids: [c.candidateId],
      match: { terms, via },
    });
  };

  // GDELT: outlets we can't read, by the domain GDELT files them under.
  const gdeltSources = opts.sources.filter((s) => s.gdeltDomain);
  const gdeltLoop = async () => {
    const queue = await nextUp(db, "gdelt", people, GDELT_PER_RUN, now);
    for (const [i, c] of queue.entries()) {
      // A state or local outlet only covers its own state's races.
      const srcs = gdeltSources.filter((s) => s.scope === "national" || (!!s.state && s.state === c.state));
      if (!srcs.length) continue;
      if (i > 0) await sleep(GDELT_SPACING_MS);
      summary.gdeltAsked++;
      let status = 0;
      let error: string | null = null;
      try {
        const res = await safeFetch(gdeltUrl(gdeltQuery(c, srcs.map((s) => s.gdeltDomain!)), `${LOOKBACK_DAYS}d`), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) }, { fetchImpl: opts.fetchImpl, resolve: opts.resolve });
        status = res.status;
        const body = res.text ?? "";
        if (isGdeltThrottle(body)) {
          summary.gdeltThrottled = true;
          break;
        }
        for (const a of parseGdelt(body)) {
          const src = srcs.find((s) => a.domain && siteOf(a.domain) === s.gdeltDomain);
          if (!src) continue;
          summary.gdeltFound++;
          add(a, src, c, "gdelt", [c.name.toLowerCase()]);
        }
      } catch (e) {
        error = e instanceof Error ? e.name : "fetch failed";
      }
      asked.push({ source_key: `gdelt:${c.candidateId}`, last_fetched_at: now.toISOString(), last_status: status || null, last_error: error, failures: error ? 1 : 0 });
    }
  };

  // NYT: tagged people first; otherwise the same identity rules as any story text.
  const nytLoop = async () => {
    if (!opts.nytKey) {
      summary.nytSkipped = "no NYT_API_KEY";
      return;
    }
    const queue = await nextUp(db, "nyt", people, NYT_PER_RUN, now);
    for (const [i, c] of queue.entries()) {
      if (i > 0) await sleep(NYT_SPACING_MS);
      summary.nytAsked++;
      let status = 0;
      let error: string | null = null;
      try {
        // The key is a query parameter by the API's design; it never appears in logs or stored rows.
        const res = await (opts.fetchImpl ?? fetch)(nytUrl(c, opts.nytKey, since), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
        status = res.status;
        if (res.status === 429) {
          error = "rate limited";
        } else if (res.ok) {
          for (const a of parseNyt(await res.text())) {
            const tagged = nytTagged(a.persons, c);
            const m = tagged ? null : match(a.title, a.summary ?? "", { scope: "national" }, a.body);
            if (!tagged && !m?.candidateIds.includes(c.candidateId)) continue;
            summary.nytFound++;
            add(a, { key: NYT_KEY, name: NYT_NAME }, c, "nyt-api", tagged ? [`nyt tag: ${c.name.toLowerCase()}`] : (m?.terms ?? []));
          }
        } else {
          error = `HTTP ${res.status}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.name : "fetch failed";
      }
      asked.push({ source_key: `nyt:${c.candidateId}`, last_fetched_at: now.toISOString(), last_status: status || null, last_error: error, failures: error ? 1 : 0 });
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
