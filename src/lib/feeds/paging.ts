/**
 * "Load more as you scroll" for the news carousels (owner, 2026-10-30): the
 * page loads the newest FEED_PAGE stories per race, and each carousel asks
 * `feed_page()` for the next FEED_PAGE older ones when it nears its end.
 * Pure; the client wiring is in components/ballot/LiveFeed.tsx.
 *
 * Each race or candidate keeps its own cursor (the oldest story its own pages
 * returned), never one derived from everything on the page: a candidate's
 * older stories must not make its race skip the ones in between.
 */
export const FEED_PAGE = 25;

export interface FeedCursor {
  at: string;
  id: string;
}

export interface PageState {
  /** Older than this; null = start from the newest. */
  cursor: FeedCursor | null;
  done: boolean;
}

interface PagedRow {
  id: string;
  type: string;
  published_at: string;
  contest_ids: string[];
}

export const targetKey = (t: { contestId?: string; candidateId?: string }) => (t.candidateId ? `c:${t.candidateId}` : `r:${t.contestId}`);

/** Newest first, ties by id (the order `ballot_feed` and `feed_page` use). */
const newer = (a: PagedRow, b: PagedRow) => b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id);

/**
 * Where each race's paging starts after the page load: its oldest loaded news
 * story, or done when the load returned fewer than a full page.
 */
export function initialPages(rows: PagedRow[], contestIds: Iterable<string>, pageSize = FEED_PAGE): Map<string, PageState> {
  const out = new Map<string, PageState>();
  for (const c of contestIds) {
    const news = rows.filter((r) => r.type === "news" && r.contest_ids.includes(c)).sort(newer);
    const last = news[news.length - 1];
    out.set(targetKey({ contestId: c }), { cursor: last ? { at: last.published_at, id: last.id } : null, done: news.length < pageSize });
  }
  return out;
}

/** The state after a page came back. */
export function nextPage(rows: PagedRow[], pageSize = FEED_PAGE): PageState {
  const last = [...rows].sort(newer)[rows.length - 1];
  return { cursor: last ? { at: last.published_at, id: last.id } : null, done: rows.length < pageSize };
}
