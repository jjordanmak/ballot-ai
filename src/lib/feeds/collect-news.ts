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
import { buildMatcher, type TrackedContest } from "./match";
import { parseFeed } from "./parse";
import type { NewsSource } from "./sources";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];

const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";

export interface CollectSummary {
  sources: number;
  fetched: number;
  notModified: number;
  failed: string[];
  entries: number;
  matched: number;
  published: number;
  held: number;
}

export async function loadTracked(db: Db, electionId: string): Promise<TrackedContest[]> {
  const { data, error } = await db
    .from("contests")
    .select("id, kind, title, divisions(name, state), contest_candidates(id, ballot_name, display_name)")
    .eq("election_id", electionId);
  if (error) throw new Error(`tracked contests: ${error.message}`);
  return (data ?? []).map((c) => {
    const div = (Array.isArray(c.divisions) ? c.divisions[0] : c.divisions) as { name: string; state: string | null } | null;
    return {
      id: c.id,
      kind: c.kind === "measure" ? "measure" : "candidate",
      title: c.title,
      divisionName: div?.name ?? "",
      state: div?.state ?? undefined,
      candidates: (c.contest_candidates ?? []).map((k) => ({
        id: k.id,
        names: [k.display_name, k.ballot_name].filter((n): n is string => !!n),
      })),
    };
  });
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await fn(t);
  }));
}

export async function collectNews(opts: {
  db: Db;
  electionId: string;
  sources: NewsSource[];
  now?: Date;
  fetchImpl?: typeof fetch;
  publish?: boolean;
}): Promise<CollectSummary> {
  const { db, electionId } = opts;
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const publish = opts.publish ?? true;
  const sources = opts.sources.filter((s) => s.enabled);
  const summary: CollectSummary = { sources: sources.length, fetched: 0, notModified: 0, failed: [], entries: 0, matched: 0, published: 0, held: 0 };

  const tracked = await loadTracked(db, electionId);
  if (!tracked.length) return summary;
  const match = buildMatcher(tracked);

  const { data: states } = await db.from("feed_source_state").select("*").in("source_key", sources.map((s) => s.key));
  const stateByKey = new Map((states ?? []).map((s) => [s.source_key, s]));
  const rows = new Map<string, FeedInsert>();

  await mapLimit(sources, CONCURRENCY, async (src) => {
    const prev = stateByKey.get(src.key);
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" };
    if (prev?.etag) headers["if-none-match"] = prev.etag;
    if (prev?.last_modified) headers["if-modified-since"] = prev.last_modified;
    let status = 0;
    let error: string | null = null;
    let seen = 0;
    try {
      const res = await fetchImpl(src.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store", redirect: "follow" });
      status = res.status;
      if (res.status === 304) {
        summary.notModified++;
      } else if (!res.ok) {
        error = `HTTP ${res.status}`;
      } else {
        summary.fetched++;
        const entries = parseFeed(await res.text());
        seen = entries.length;
        summary.entries += entries.length;
        for (const e of entries) {
          const url = canonicalUrl(e.link);
          if (!url || rows.has(url)) continue;
          const verdict = checkEntry(e, now);
          if (verdict.status === "skip") continue;
          const m = match(e.title, e.summary, src);
          if (!m) continue;
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
            image_url: e.image ?? null,
            published_at: (e.published ?? now).toISOString(),
            status: held ? "held" : "published",
            held_reason: held,
            contest_ids: m.contestIds,
            candidate_ids: m.candidateIds,
            match: { terms: m.terms },
          });
        }
        await db
          .from("feed_source_state")
          .upsert({
            source_key: src.key,
            etag: res.headers.get("etag"),
            last_modified: res.headers.get("last-modified"),
            last_fetched_at: now.toISOString(),
            last_status: status,
            last_error: null,
            items_seen: seen,
          });
        return;
      }
    } catch (e) {
      error = e instanceof Error ? e.name : "fetch failed";
    }
    if (error) summary.failed.push(`${src.key}: ${error}`);
    await db.from("feed_source_state").upsert({
      source_key: src.key,
      etag: prev?.etag ?? null,
      last_modified: prev?.last_modified ?? null,
      last_fetched_at: now.toISOString(),
      last_status: status || null,
      last_error: error,
      items_seen: prev?.items_seen ?? 0,
    });
  });

  // Skip URLs already stored, then insert the rest.
  const urls = [...rows.keys()];
  for (let i = 0; i < urls.length; i += 100) {
    const { data } = await db.from("feed_items").select("url").in("url", urls.slice(i, i + 100));
    for (const r of data ?? []) rows.delete(r.url);
  }
  const fresh = [...rows.values()];
  if (fresh.length) {
    const { error } = await db.from("feed_items").upsert(fresh, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw new Error(`feed_items insert: ${error.message}`);
  }
  summary.published = fresh.filter((r) => r.status === "published").length;
  summary.held = fresh.length - summary.published;
  logEvent("feeds.news", { ...summary, failed: summary.failed.join("; ") });
  return summary;
}

/**
 * Daily retraction check: a published article whose URL now returns 404/410
 * is marked `removed`, and open pages drop it via Realtime.
 */
export async function recheckPublished(db: Db, opts: { now?: Date; fetchImpl?: typeof fetch; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const { data } = await db
    .from("feed_items")
    .select("id, url")
    .eq("status", "published")
    .or(`checked_at.is.null,checked_at.lt.${dayAgo}`)
    .limit(opts.limit ?? 200);
  let removed = 0;
  await mapLimit(data ?? [], CONCURRENCY, async (item) => {
    let gone = false;
    try {
      const res = await fetchImpl(item.url, { method: "HEAD", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
      gone = res.status === 404 || res.status === 410;
    } catch {
      // Network trouble isn't a retraction; try again tomorrow.
    }
    if (gone) removed++;
    await db.from("feed_items").update(gone ? { status: "removed", checked_at: now.toISOString() } : { checked_at: now.toISOString() }).eq("id", item.id);
  });
  logEvent("feeds.recheck", { checked: data?.length ?? 0, removed });
  return { checked: data?.length ?? 0, removed };
}
