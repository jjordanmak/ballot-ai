/**
 * Live polls from Wikipedia's election pages (owner decision 2026-10-29: a
 * stopgap until a more official source; attribution is shown on the page).
 *
 * For every tracked state-level contest, the matching Wikipedia page is
 * looked up by its standard title. One batched request reads the pages'
 * current revisions; only changed pages are fetched and parsed. Each poll
 * row that passes `checkPoll` is published as a `feed_items` row of type
 * "poll"; the rest are kept as held, with a reason. Never touches an address.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATE_NAMES as STATE_DISPLAY } from "@/domain/categorize";
import { normalizeForMatch } from "@/domain/text";
import { logEvent } from "@/lib/observability/log";
import type { Database, Json } from "@/lib/supabase/types";
import approvedList from "@/data/sources/pollsters.json";
import { loadTracked } from "./collect-news";
import type { TrackedContest } from "./match";
import { safeFetch, type Resolver } from "./safeFetch";
import { checkPoll, matchTable, parsePollTables, type Pollster } from "./wikiPolls";

type Db = SupabaseClient<Database>;
type FeedInsert = Database["public"]["Tables"]["feed_items"]["Insert"];

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "ballot.ai poll collector (+https://ballot-ai.vercel.app)";
const APPROVED = (approvedList as { pollsters: Pollster[] }).pollsters;
const YEAR = 2026;

/** Wikipedia page titles that would hold polls for a contest (state-level contests only). */
export function wikiTitlesFor(c: TrackedContest): string[] {
  if (!c.stateLevel || !c.state) return [];
  const state = STATE_DISPLAY[c.state];
  if (!state) return [];
  const t = normalizeForMatch(c.title);
  if (c.kind === "measure") return [`${YEAR} ${state} ${c.title.replace(/\s+/g, " ").trim()}`];
  if (/^governor( and lieutenant governor)?$/.test(t)) return [`${YEAR} ${state} gubernatorial election`];
  if (/^(lieutenant|lt) governor$/.test(t)) return [`${YEAR} ${state} lieutenant gubernatorial election`];
  if (/attorney general/.test(t)) return [`${YEAR} ${state} Attorney General election`];
  if (/^secretary of state$/.test(t)) return [`${YEAR} ${state} Secretary of State election`];
  if (/\b(u s|united states) senat/.test(t)) {
    return [`${YEAR} United States Senate election in ${state}`, `${YEAR} United States Senate special election in ${state}`];
  }
  if (/\b(u s|united states) (representative|house)|representative in congress|member of congress/.test(t)) {
    return [`${YEAR} United States House of Representatives elections in ${state}`];
  }
  if (/^(state )?(treasurer|controller|comptroller|auditor|insurance commissioner|superintendent of public instruction)/.test(t)) {
    return [`${YEAR} ${state} ${c.title.replace(/^State /i, "")} election`];
  }
  return [];
}

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

async function api(params: Record<string, string>, deps: { fetchImpl?: typeof fetch; resolve?: Resolver }) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", redirects: "1", ...params })}`;
  const res = await safeFetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000), maxBytes: 8_000_000 }, deps);
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  return JSON.parse(res.text ?? "{}");
}

/** Current revision id per requested title (missing pages omitted). Batches of 50. */
async function revisions(titles: string[], deps: { fetchImpl?: typeof fetch; resolve?: Resolver }): Promise<Map<string, { revid: number; title: string }>> {
  const out = new Map<string, { revid: number; title: string }>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({ action: "query", prop: "revisions", rvprop: "ids", titles: batch.join("|") }, deps);
    const q = data.query ?? {};
    // Follow normalization and redirects back to the title we asked for.
    const alias = new Map<string, string>();
    for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) alias.set(n.to, alias.get(n.from) ?? n.from);
    for (const p of q.pages ?? []) {
      if (p.missing || !p.revisions?.[0]?.revid) continue;
      const asked = alias.get(p.title) ?? p.title;
      out.set(asked, { revid: p.revisions[0].revid, title: p.title });
    }
  }
  return out;
}

export interface PollSummary {
  contests: number;
  pages: number;
  changed: number;
  published: number;
  held: number;
  failed: string[];
}

export async function collectPolls(opts: {
  db: Db;
  electionId: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  publish?: boolean;
  budgetMs?: number;
}): Promise<PollSummary> {
  const { db, electionId } = opts;
  const now = opts.now ?? new Date();
  const until = Date.now() + (opts.budgetMs ?? 90_000);
  const deps = { fetchImpl: opts.fetchImpl, resolve: opts.resolve };
  const publish = opts.publish ?? true;
  const summary: PollSummary = { contests: 0, pages: 0, changed: 0, published: 0, held: 0, failed: [] };

  const tracked = (await loadTracked(db, electionId)).filter((c) => wikiTitlesFor(c).length);
  summary.contests = tracked.length;
  const byTitle = new Map<string, TrackedContest[]>();
  for (const c of tracked) for (const t of wikiTitlesFor(c)) byTitle.set(t, [...(byTitle.get(t) ?? []), c]);
  const titles = [...byTitle.keys()];
  if (!titles.length) return summary;

  const revs = await revisions(titles, deps);
  summary.pages = revs.size;
  const keys = titles.map((t) => `wiki:${t}`);
  const { data: states } = await db.from("feed_source_state").select("source_key, etag").in("source_key", keys);
  const seenRev = new Map((states ?? []).map((s) => [s.source_key, s.etag]));

  for (const [asked, rev] of revs) {
    if (Date.now() > until) break;
    const key = `wiki:${asked}`;
    if (seenRev.get(key) === String(rev.revid)) continue;
    summary.changed++;
    try {
      const data = await api({ action: "parse", page: rev.title, prop: "wikitext" }, deps);
      const tables = parsePollTables(data.parse?.wikitext ?? "");
      const rows: FeedInsert[] = [];
      for (const contest of byTitle.get(asked) ?? []) {
        for (const table of tables) {
          const columns = matchTable(table, { measure: contest.kind === "measure", candidates: contest.candidates });
          if (!columns) continue;
          for (const row of table.rows) {
            const verdict = checkPoll(row, APPROVED, now);
            const held = !verdict.ok ? verdict.reason : !publish ? "publishing paused" : null;
            const pollster = verdict.ok ? verdict.pollster.name : row.pollster;
            const results = row.values
              .filter((v) => columns.has(v.header))
              .map((v) => ({ candidateId: columns.get(v.header)!, name: v.header.replace(/\s*\([^)]*\)\s*$/, ""), pct: v.pct }))
              .sort((a, b) => b.pct - a.pct);
            if (results.length < 2 || !row.end) continue;
            const release = row.releaseUrl ?? wikiUrl(rev.title);
            const payload = {
              pollster,
              start: row.start ?? null,
              end: row.end,
              sample: row.sample ?? null,
              population: row.population ?? null,
              moe: row.moe ?? null,
              results,
              other: row.other ?? null,
              undecided: row.undecided ?? null,
              releaseUrl: row.releaseUrl ?? null,
              wikipediaUrl: wikiUrl(rev.title),
              revid: rev.revid,
            };
            rows.push({
              election_id: electionId,
              type: "poll",
              source_key: "wikipedia-polls",
              publisher: pollster,
              title: `${pollster} poll: ${contest.title}`,
              excerpt: [
                results.map((r) => `${r.name} ${r.pct}%`).join(", "),
                row.dates,
                row.sample ? `${row.sample.toLocaleString("en-US")}${row.population ? ` ${row.population}` : ""}` : "",
                row.moe ? `±${row.moe}%` : "",
              ]
                .filter(Boolean)
                .join(" · ")
                .slice(0, 280),
              // One row per poll, contest and population; a release can cover several.
              url: `${release}#ballot-ai:${contest.id}:${row.population ?? "all"}:${row.end}`,
              published_at: `${row.end}T12:00:00.000Z`,
              status: held ? "held" : "published",
              held_reason: held,
              contest_ids: [contest.id],
              candidate_ids: contest.kind === "measure" ? [] : results.map((r) => r.candidateId),
              match: { wikipedia: rev.title } as Json,
              payload: payload as unknown as Json,
            });
          }
        }
      }
      const unique = [...new Map(rows.map((r) => [r.url, r])).values()];
      if (unique.length) {
        // Corrections on Wikipedia update the stored poll (open pages get the change).
        const { error } = await db.from("feed_items").upsert(unique, { onConflict: "url" });
        if (error) throw new Error(error.message);
      }
      summary.published += unique.filter((r) => r.status === "published").length;
      summary.held += unique.filter((r) => r.status === "held").length;
      await db.from("feed_source_state").upsert({ source_key: key, etag: String(rev.revid), last_fetched_at: now.toISOString(), last_status: 200, last_error: null, failures: 0, items_seen: unique.length });
    } catch (e) {
      summary.failed.push(`${asked}: ${e instanceof Error ? e.message : "failed"}`);
    }
    await new Promise((r) => setTimeout(r, 500)); // be gentle with Wikipedia
  }
  logEvent("feeds.polls", { ...summary, failed: summary.failed.join("; ") });
  return summary;
}
