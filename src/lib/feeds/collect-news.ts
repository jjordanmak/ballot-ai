/**
 * One news collection pass: fetch every approved source (conditional GET),
 * match each new article to tracked November contests and candidates,
 * apply the automated checks, and store the result. Matched items publish
 * immediately or are held with a reason; unmatched articles are not stored.
 *
 * Matching tries the headline and feed summary first, then the article's own
 * text: the feed's full text when it carries it, else the page, read once
 * and politely (`article.ts`) within a per-run cap, most promising first.
 *
 * Runs from the Vercel cron route; never touches an address.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { readArticle, type ReadOutcome } from "./article";
import { canonicalUrl } from "./canonical";
import { checkEntry } from "./checks";
import { buildHint, buildMatcher, isStateLevelDivision, type MatchResult, type TrackedContest } from "./match";
import { discoverFeed } from "./discover";
import { looksLikeFeed, parseFeed, type FeedEntry } from "./parse";
import { safeFetch, type Resolver } from "./safeFetch";
import type { NewsSource } from "./sources";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];
type SourceState = Database["public"]["Tables"]["feed_source_state"]["Row"];
type SourceStateInsert = Database["public"]["Tables"]["feed_source_state"]["Insert"];

const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 16;
/** Stop starting new feed fetches after this long; article reads get the time after it. */
const DEFAULT_BUDGET_MS = 60_000;
/** Stop starting article reads after this long from the start, so cron runs (every 2 minutes) never overlap. */
const READ_BUDGET_MS = 85_000;
/** Article pages read per run, and per site per run (each site allows one request every ~10 s). */
const MAX_READS = 40;
const MAX_READS_PER_HOST = 3;
const READ_CONCURRENCY = 8;
/** A site that refused this many reads within REFUSED_FOR_MS isn't read again until that window passes. */
const REFUSALS_TO_SKIP = 3;
const REFUSED_FOR_MS = 24 * 3600_000;
/** Longest a read waits for its site's slot before trying again next run. */
const READ_MAX_WAIT_MS = 8_000;
const MINUTE = 60_000;
/** How often each tier is fetched. */
const INTERVAL_MS: Record<NewsSource["scope"], number> = { national: 2 * MINUTE, state: 6 * MINUTE, local: 10 * MINUTE };
const MAX_BACKOFF_MS = 6 * 60 * MINUTE;
/** Cron runs drift by a few seconds; don't push a source to the next run over that. */
const SLACK_MS = 20_000;

/** When a source is next due: its tier interval, doubled for each consecutive failure (capped at 6 hours). */
export function nextDue(
  src: Pick<NewsSource, "scope">,
  prev?: Pick<SourceState, "last_fetched_at" | "failures"> & { retry_at?: string | null } | null,
): number {
  if (!prev?.last_fetched_at) return 0;
  const wait = Math.min(INTERVAL_MS[src.scope] * 2 ** Math.min(prev.failures ?? 0, 10), MAX_BACKOFF_MS);
  const due = Date.parse(prev.last_fetched_at) + wait - SLACK_MS;
  // A publisher's Retry-After is honored when it asks for longer than the backoff.
  return prev.retry_at ? Math.max(due, Date.parse(prev.retry_at)) : due;
}

/** Retry-After as seconds or an HTTP date → ISO time, capped at a day. */
export function retryAfter(header: string | null, now: Date): string | null {
  if (!header) return null;
  const secs = /^\d+$/.test(header.trim()) ? Number(header.trim()) : (Date.parse(header) - now.getTime()) / 1000;
  if (!Number.isFinite(secs) || secs <= 0) return null;
  return new Date(now.getTime() + Math.min(secs, 86_400) * 1000).toISOString();
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
  /** Sources whose moved feed was found on the outlet's own site this run. */
  discovered: string[];
  entries: number;
  matched: number;
  /** Of those, matched on the article's text (from the feed, or read from the page). */
  matchedOnText: number;
  /** Article pages read this run, and how many reads were skipped or failed (robots, busy, blocked, empty, error). */
  articlesRead: number;
  readsFailed: number;
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
  readBudgetMs?: number;
}): Promise<CollectSummary> {
  const { db, electionId } = opts;
  const now = opts.now ?? new Date();
  const publish = opts.publish ?? true;
  const sources = opts.sources.filter((s) => s.enabled);
  const started = Date.now();
  const until = started + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const readUntil = started + (opts.readBudgetMs ?? READ_BUDGET_MS);
  const summary: CollectSummary = {
    sources: sources.length, due: 0, deferred: 0, fetched: 0, notModified: 0, failed: [], discovered: [],
    entries: 0, matched: 0, matchedOnText: 0, articlesRead: 0, readsFailed: 0, published: 0, held: 0, released: 0,
  };

  summary.released = await releaseHeld(db, electionId, now, publish);
  const tracked = await loadTracked(db, electionId);
  if (!tracked.length) return summary;
  const match = buildMatcher(tracked);
  const hint = buildHint(tracked);
  const trackedStates = new Set(tracked.map((c) => c.state).filter(Boolean));
  // A state or local outlet can only match its own state's contests.
  const canMatch = (src: NewsSource) => src.scope === "national" || (!!src.state && trackedStates.has(src.state));

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
  /** Unmatched entries worth reading the page of, by canonical URL. */
  const toRead = new Map<string, { e: FeedEntry; src: NewsSource; verdict: ReturnType<typeof checkEntry>; score: number }>();

  const addRow = (e: FeedEntry, src: NewsSource, link: string, verdict: ReturnType<typeof checkEntry>, m: MatchResult) => {
    const existing = rows.get(link);
    if (existing) {
      // Same article from another source: keep every contest either one matched.
      existing.contest_ids = [...new Set([...(existing.contest_ids ?? []), ...m.contestIds])];
      existing.candidate_ids = [...new Set([...(existing.candidate_ids ?? []), ...m.candidateIds])];
      return;
    }
    summary.matched++;
    if (m.via === "article") summary.matchedOnText++;
    const held = verdict.status === "held" ? verdict.reason : !publish ? "publishing paused" : null;
    rows.set(link, {
      election_id: electionId,
      type: "news",
      source_key: src.key,
      publisher: src.name,
      title: e.title.slice(0, 300),
      excerpt: e.summary ? e.summary.slice(0, 280) : null,
      url: link,
      image_url: e.image && /^https:\/\//.test(e.image) ? e.image : null,
      published_at: (e.published ?? now).toISOString(),
      status: held ? "held" : "published",
      held_reason: held,
      contest_ids: m.contestIds,
      candidate_ids: m.candidateIds,
      match: { terms: m.terms, via: m.via },
    });
  };
  // Source state is written only after the items are stored: a 304 next run
  // must never hide articles this run failed to save.
  const nextStates: SourceStateInsert[] = [];

  const reads: { url: string; read_at: string; outcome: ReadOutcome; matched: boolean }[] = [];
  /** Read the most promising unmatched articles' pages, newest first, and match on their text. */
  async function readArticles() {
    for (const link of rows.keys()) toRead.delete(link);
    if (!toRead.size || Date.now() > readUntil) return;
    const ranked = [...toRead.entries()]
      .sort(([, a], [, b]) => b.score - a.score || (b.e.published?.getTime() ?? 0) - (a.e.published?.getTime() ?? 0))
      .slice(0, MAX_READS * 5);
    const seen = new Set<string>();
    for (let i = 0; i < ranked.length; i += 50) {
      const { data } = await db.from("feed_article_reads").select("url").in("url", ranked.slice(i, i + 50).map(([u]) => u));
      for (const r of data ?? []) seen.add(r.url);
    }
    // Sites that refused our last reads (robots.txt or 403/429) are skipped for a day, not retried per article.
    const refused = new Map<string, number>();
    const { data: recent } = await db
      .from("feed_article_reads")
      .select("url")
      .in("outcome", ["robots", "blocked"])
      .gte("read_at", new Date(now.getTime() - REFUSED_FOR_MS).toISOString())
      .limit(5000);
    for (const r of recent ?? []) {
      const host = new URL(r.url).hostname;
      refused.set(host, (refused.get(host) ?? 0) + 1);
    }
    const perHost = new Map<string, number>();
    const picked = ranked.filter(([u]) => {
      if (seen.has(u)) return false;
      const host = new URL(u).hostname;
      if ((refused.get(host) ?? 0) >= REFUSALS_TO_SKIP) return false;
      const n = perHost.get(host) ?? 0;
      if (n >= MAX_READS_PER_HOST) return false;
      perHost.set(host, n + 1);
      return true;
    }).slice(0, MAX_READS);
    await mapLimit(picked, READ_CONCURRENCY, async ([link, { e, src, verdict }]) => {
      // A failed read never costs the run its feed results.
      const r = await readArticle({ db, now, fetchImpl: opts.fetchImpl, resolve: opts.resolve }, link, USER_AGENT, READ_MAX_WAIT_MS).catch(() => ({ outcome: "error" as const, text: undefined }));
      if (r.outcome === "read") summary.articlesRead++;
      else summary.readsFailed++;
      const m = r.text ? match(e.title, e.summary, src, r.text) : null;
      if (m) addRow(e, src, link, verdict, m);
      // A busy site is tried again next run; every other outcome is final.
      if (r.outcome !== "busy") reads.push({ url: link, read_at: now.toISOString(), outcome: r.outcome, matched: !!m });
    }, readUntil);
  }

  summary.deferred = await mapLimit(due, CONCURRENCY, async (src) => {
    const prev = stateByKey.get(src.key);
    // A feed found by discovery replaces the listed URL until it fails too.
    let url = prev?.resolved_url ?? src.url;
    let status = 0;
    let error: string | null = null;
    let retryAt: string | null = null;
    let tried = false;
    for (;;) {
      const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" };
      // Conditional headers belong to the URL they came from.
      if (!tried && prev?.etag) headers["if-none-match"] = prev.etag;
      if (!tried && prev?.last_modified) headers["if-modified-since"] = prev.last_modified;
      let body: string | undefined;
      error = null;
      try {
        const res = await safeFetch(
          url,
          { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" },
          { fetchImpl: opts.fetchImpl, resolve: opts.resolve },
        );
        status = res.status;
        body = res.text;
        if (res.status === 304) {
          summary.notModified++;
        } else if (!res.ok) {
          error = `HTTP ${res.status}`;
          if (res.status === 429 || res.status === 503) retryAt = retryAfter(res.headers.get("retry-after"), now);
        } else if (!looksLikeFeed(res.text ?? "")) {
          // A 200 that isn't RSS/Atom (moved feed, HTML page) is a failure, so it backs off and shows up.
          error = "not a feed";
        } else {
          summary.fetched++;
          const entries = parseFeed(res.text ?? "");
          summary.entries += entries.length;
          for (const e of entries) {
            const link = canonicalUrl(e.link);
            if (!link) continue;
            const verdict = checkEntry(e, now);
            if (verdict.status === "skip") continue;
            const m = match(e.title, e.summary, src) ?? (e.content ? match(e.title, e.summary, src, e.content) : null);
            if (m) {
              addRow(e, src, link, verdict, m);
              toRead.delete(link);
            } else if (!e.content && canMatch(src) && !rows.has(link)) {
              toRead.set(link, { e, src, verdict, score: hint(e.title, e.summary) });
            }
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
            resolved_url: url === src.url ? null : url,
            retry_at: null,
          });
          return;
        }
      } catch (e) {
        error = e instanceof Error ? e.name : "fetch failed";
      }
      // Moved feed: look for the outlet's own advertised feed once, then retry with it.
      const moved = error === "not a feed" || status === 404 || status === 410;
      if (!moved || tried || Date.now() > until) break;
      tried = true;
      const found = await discoverFeed(src.url, error === "not a feed" ? body : undefined, {
        fetchImpl: opts.fetchImpl,
        resolve: opts.resolve,
        userAgent: USER_AGENT,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      if (!found || found === url) {
        error = "no feed advertised";
        break;
      }
      summary.discovered.push(`${src.key}: ${found}`);
      url = found;
    }
    if (error) summary.failed.push(`${src.key}: ${error}`);
    nextStates.push({
      source_key: src.key,
      etag: tried ? null : (prev?.etag ?? null),
      last_modified: tried ? null : (prev?.last_modified ?? null),
      last_fetched_at: now.toISOString(),
      last_status: status || null,
      last_error: error,
      failures: error ? (prev?.failures ?? 0) + 1 : 0,
      items_seen: prev?.items_seen ?? 0,
      resolved_url: tried ? null : (prev?.resolved_url ?? null),
      retry_at: retryAt,
    });
  }, until);

  await readArticles();

  // Skip URLs already stored, then insert the rest. A story first found by name
  // through an API (GDELT, the NYT) takes the outlet's own headline, summary and
  // image when its feed brings it (collect-apis.ts).
  const urls = [...rows.keys()];
  const upgrades: { url: string; row: FeedInsert; prior: { contest_ids: string[]; candidate_ids: string[] } }[] = [];
  for (let i = 0; i < urls.length; i += 50) {
    const { data, error } = await db.from("feed_items").select("url, match, contest_ids, candidate_ids").in("url", urls.slice(i, i + 50));
    if (error) throw new Error(`feed_items lookup: ${error.message}`);
    for (const r of data ?? []) {
      const via = (r.match as { via?: string } | null)?.via;
      if (via === "gdelt" || via === "nyt-api") upgrades.push({ url: r.url, row: rows.get(r.url)!, prior: { contest_ids: r.contest_ids ?? [], candidate_ids: r.candidate_ids ?? [] } });
      rows.delete(r.url);
    }
  }
  for (const { url, row, prior } of upgrades) {
    await db
      .from("feed_items")
      .update({
        title: row.title,
        excerpt: row.excerpt,
        image_url: row.image_url,
        contest_ids: [...new Set([...prior.contest_ids, ...(row.contest_ids ?? [])])],
        candidate_ids: [...new Set([...prior.candidate_ids, ...(row.candidate_ids ?? [])])],
      })
      .eq("url", url);
  }
  const fresh = [...rows.values()];
  if (fresh.length) {
    const { error } = await db.from("feed_items").upsert(fresh, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw new Error(`feed_items insert: ${error.message}`);
  }
  if (nextStates.length) await db.from("feed_source_state").upsert(nextStates);
  if (reads.length) await db.from("feed_article_reads").upsert(reads, { onConflict: "url", ignoreDuplicates: true });
  summary.published = fresh.filter((r) => r.status === "published").length;
  summary.held = fresh.length - summary.published;
  logEvent("feeds.news", { ...summary, failed: summary.failed.join("; "), discovered: summary.discovered.join("; ") });
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
