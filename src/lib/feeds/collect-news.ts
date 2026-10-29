/**
 * One news collection pass: fetch every approved source (conditional GET),
 * match each new article to tracked November contests and candidates,
 * apply the automated checks, and store the result. Matched items publish
 * immediately or are held with a reason; unmatched articles are not stored.
 *
 * Runs from the Vercel cron route; never touches an address.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { canonicalUrl } from "./canonical";
import { checkEntry } from "./checks";
import { buildMatcher, isStateLevelDivision, type TrackedContest } from "./match";
import { looksLikeFeed, parseFeed } from "./parse";
import { safeFetch, type Resolver } from "./safeFetch";
import type { NewsSource } from "./sources";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];
type SourceState = Database["public"]["Tables"]["feed_source_state"]["Row"];
type SourceStateInsert = Database["public"]["Tables"]["feed_source_state"]["Insert"];

const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 16;
/** Stop starting new fetches after this long, so cron runs (every 2 minutes) never overlap. */
const DEFAULT_BUDGET_MS = 80_000;
const MINUTE = 60_000;
/** How often each tier is fetched. */
const INTERVAL_MS: Record<NewsSource["scope"], number> = { national: 2 * MINUTE, state: 6 * MINUTE, local: 10 * MINUTE };
const MAX_BACKOFF_MS = 6 * 60 * MINUTE;
/** Cron runs drift by a few seconds; don't push a source to the next run over that. */
const SLACK_MS = 20_000;

/** When a source is next due: its tier interval, doubled for each consecutive failure (capped at 6 hours). */
export function nextDue(src: Pick<NewsSource, "scope">, prev?: Pick<SourceState, "last_fetched_at" | "failures"> | null): number {
  if (!prev?.last_fetched_at) return 0;
  const wait = Math.min(INTERVAL_MS[src.scope] * 2 ** Math.min(prev.failures ?? 0, 10), MAX_BACKOFF_MS);
  return Date.parse(prev.last_fetched_at) + wait - SLACK_MS;
}
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";

export interface CollectSummary {
  sources: number;
  /** Sources due this run, and how many of those the time budget left for the next run. */
  due: number;
  deferred: number;
  fetched: number;
  notModified: number;
  failed: string[];
  entries: number;
  matched: number;
  published: number;
  held: number;
  /** Held items published this run because their reason no longer applies. */
  released: number;
}

const PAGE = 1000;

/** Every tracked contest for the election, paged past PostgREST's row cap. */
export async function loadTracked(db: Db, electionId: string): Promise<TrackedContest[]> {
  const out: TrackedContest[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("contests")
      .select("id, kind, title, division_key, divisions(name, state, scope), contest_candidates(id, ballot_name, display_name)")
      .eq("election_id", electionId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`tracked contests: ${error.message}`);
    for (const c of data ?? []) {
      const div = (Array.isArray(c.divisions) ? c.divisions[0] : c.divisions) as { name: string; state: string | null; scope: string | null } | null;
      out.push({
        id: c.id,
        kind: c.kind === "measure" ? "measure" : "candidate",
        title: c.title,
        divisionName: div?.name ?? "",
        state: div?.state ?? undefined,
        stateLevel: isStateLevelDivision(c.division_key, div?.scope, div?.name),
        candidates: (c.contest_candidates ?? []).map((k) => ({
          id: k.id,
          names: [k.display_name, k.ballot_name].filter((n): n is string => !!n),
        })),
      });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>, until = Infinity) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length && Date.now() < until) await fn(queue.shift()!);
  }));
  return queue.length;
}

/**
 * Held items that no longer fail a check: everything paused while
 * publishing was switched off, and items dated in the future once that time
 * has come. Returns how many were published.
 */
async function releaseHeld(db: Db, electionId: string, now: Date, publish: boolean): Promise<number> {
  if (!publish) return 0;
  let released = 0;
  const paused = await db
    .from("feed_items")
    .update({ status: "published", held_reason: null })
    .eq("election_id", electionId)
    .eq("status", "held")
    .eq("held_reason", "publishing paused")
    .select("id");
  released += paused.data?.length ?? 0;
  const due = await db
    .from("feed_items")
    .update({ status: "published", held_reason: null })
    .eq("election_id", electionId)
    .eq("status", "held")
    .eq("held_reason", "publish date in the future")
    .lte("published_at", now.toISOString())
    .select("id");
  released += due.data?.length ?? 0;
  return released;
}

export async function collectNews(opts: {
  db: Db;
  electionId: string;
  sources: NewsSource[];
  now?: Date;
  fetchImpl?: typeof fetch;
  /** DNS lookup for the private-address check (tests inject one). */
  resolve?: Resolver;
  publish?: boolean;
  budgetMs?: number;
}): Promise<CollectSummary> {
  const { db, electionId } = opts;
  const now = opts.now ?? new Date();
  const publish = opts.publish ?? true;
  const sources = opts.sources.filter((s) => s.enabled);
  const until = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const summary: CollectSummary = { sources: sources.length, due: 0, deferred: 0, fetched: 0, notModified: 0, failed: [], entries: 0, matched: 0, published: 0, held: 0, released: 0 };

  summary.released = await releaseHeld(db, electionId, now, publish);
  const tracked = await loadTracked(db, electionId);
  if (!tracked.length) return summary;
  const match = buildMatcher(tracked);

  const { data: states } = await db.from("feed_source_state").select("*").in("source_key", sources.map((s) => s.key));
  const stateByKey = new Map((states ?? []).map((s) => [s.source_key, s]));
  // Only sources that are due, most overdue (or never fetched) first.
  const due = sources
    .map((src) => ({ src, at: nextDue(src, stateByKey.get(src.key)) }))
    .filter((d) => d.at <= now.getTime())
    .sort((a, b) => a.at - b.at)
    .map((d) => d.src);
  summary.due = due.length;
  const rows = new Map<string, FeedInsert>();
  // Source state is written only after the items are stored: a 304 next run
  // must never hide articles this run failed to save.
  const nextStates: SourceStateInsert[] = [];

  summary.deferred = await mapLimit(due, CONCURRENCY, async (src) => {
    const prev = stateByKey.get(src.key);
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" };
    if (prev?.etag) headers["if-none-match"] = prev.etag;
    if (prev?.last_modified) headers["if-modified-since"] = prev.last_modified;
    let status = 0;
    let error: string | null = null;
    try {
      const res = await safeFetch(
        src.url,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" },
        { fetchImpl: opts.fetchImpl, resolve: opts.resolve },
      );
      status = res.status;
      if (res.status === 304) {
        summary.notModified++;
      } else if (!res.ok) {
        error = `HTTP ${res.status}`;
      } else if (!looksLikeFeed(res.text ?? "")) {
        // A 200 that isn't RSS/Atom (moved feed, HTML page) is a failure, so it backs off and shows up.
        error = "not a feed";
      } else {
        summary.fetched++;
        const entries = parseFeed(res.text ?? "");
        summary.entries += entries.length;
        for (const e of entries) {
          const url = canonicalUrl(e.link);
          if (!url) continue;
          const verdict = checkEntry(e, now);
          if (verdict.status === "skip") continue;
          const m = match(e.title, e.summary, src);
          if (!m) continue;
          const existing = rows.get(url);
          if (existing) {
            // Same article from another source: keep every contest either one matched.
            existing.contest_ids = [...new Set([...(existing.contest_ids ?? []), ...m.contestIds])];
            existing.candidate_ids = [...new Set([...(existing.candidate_ids ?? []), ...m.candidateIds])];
            continue;
          }
          summary.matched++;
          const held = verdict.status === "held" ? verdict.reason : !publish ? "publishing paused" : null;
          rows.set(url, {
            election_id: electionId,
            type: "news",
            source_key: src.key,
            publisher: src.name,
            title: e.title.slice(0, 300),
            excerpt: e.summary ? e.summary.slice(0, 280) : null,
            url,
            image_url: e.image && /^https:\/\//.test(e.image) ? e.image : null,
            published_at: (e.published ?? now).toISOString(),
            status: held ? "held" : "published",
            held_reason: held,
            contest_ids: m.contestIds,
            candidate_ids: m.candidateIds,
            match: { terms: m.terms },
          });
        }
        nextStates.push({
          source_key: src.key,
          etag: res.headers.get("etag"),
          last_modified: res.headers.get("last-modified"),
          last_fetched_at: now.toISOString(),
          last_status: status,
          last_error: null,
          failures: 0,
          items_seen: entries.length,
        });
        return;
      }
    } catch (e) {
      error = e instanceof Error ? e.name : "fetch failed";
    }
    if (error) summary.failed.push(`${src.key}: ${error}`);
    nextStates.push({
      source_key: src.key,
      etag: prev?.etag ?? null,
      last_modified: prev?.last_modified ?? null,
      last_fetched_at: now.toISOString(),
      last_status: status || null,
      last_error: error,
      failures: error ? (prev?.failures ?? 0) + 1 : 0,
      items_seen: prev?.items_seen ?? 0,
    });
  }, until);

  // Skip URLs already stored, then insert the rest.
  const urls = [...rows.keys()];
  for (let i = 0; i < urls.length; i += 50) {
    const { data, error } = await db.from("feed_items").select("url").in("url", urls.slice(i, i + 50));
    if (error) throw new Error(`feed_items lookup: ${error.message}`);
    for (const r of data ?? []) rows.delete(r.url);
  }
  const fresh = [...rows.values()];
  if (fresh.length) {
    const { error } = await db.from("feed_items").upsert(fresh, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw new Error(`feed_items insert: ${error.message}`);
  }
  if (nextStates.length) await db.from("feed_source_state").upsert(nextStates);
  summary.published = fresh.filter((r) => r.status === "published").length;
  summary.held = fresh.length - summary.published;
  logEvent("feeds.news", { ...summary, failed: summary.failed.join("; ") });
  return summary;
}

/**
 * Daily retraction check, oldest checks first and within a time budget: a
 * published article whose URL now returns 404/410 is marked `removed`, and
 * open pages drop it. Check times live in `feed_item_checks`, so checking
 * never notifies pages.
 */
export async function recheckPublished(
  db: Db,
  opts: { now?: Date; fetchImpl?: typeof fetch; resolve?: Resolver; limit?: number; budgetMs?: number } = {},
) {
  const now = opts.now ?? new Date();
  const until = Date.now() + (opts.budgetMs ?? 120_000);
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const limit = opts.limit ?? 1500;
  // Never-checked items first, then the stalest.
  const { data: published } = await db.from("feed_items").select("id, url, feed_item_checks(checked_at)").eq("status", "published").limit(5000);
  const queue = (published ?? [])
    .map((r) => {
      const chk = (Array.isArray(r.feed_item_checks) ? r.feed_item_checks[0] : r.feed_item_checks) as { checked_at: string } | null;
      return { id: r.id, url: r.url, checkedAt: chk?.checked_at ?? "" };
    })
    .filter((r) => !r.checkedAt || r.checkedAt < dayAgo)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
    .slice(0, limit);
  let removed = 0;
  let checked = 0;
  await mapLimit(queue, CONCURRENCY, async (item) => {
    let status: number | null = null;
    try {
      const res = await safeFetch(
        item.url,
        { method: "HEAD", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        { fetchImpl: opts.fetchImpl, resolve: opts.resolve },
      );
      status = res.status;
    } catch {
      // Network trouble isn't a retraction; try again tomorrow.
    }
    checked++;
    if (status === 404 || status === 410) {
      removed++;
      await db.from("feed_items").update({ status: "removed" }).eq("id", item.id);
    }
    await db.from("feed_item_checks").upsert({ item_id: item.id, checked_at: now.toISOString(), last_status: status });
  }, until);
  logEvent("feeds.recheck", { due: queue.length, checked, removed });
  return { due: queue.length, checked, removed };
}
