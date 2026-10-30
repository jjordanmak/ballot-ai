"use client";

/**
 * One Realtime channel per ballot page. The database broadcasts each newly
 * published or retracted `feed_items` row to "feed:{election}:{state}"
 * (migration 0008), so a page hears only its own state's items, never the
 * whole country's. Each "In the news" carousel, poll card and the "Last
 * updated" stat read from here instead of opening their own channels.
 * After a dropped connection (a phone waking up, a network change) or when
 * the tab becomes visible again, the page refetches so nothing is missed.
 *
 * Each carousel loads older stories as it nears its end (`useFeedPaging`,
 * `feed_page()`), FEED_PAGE at a time, with its own cursor.
 *
 * The same channel carries "research" messages (migration 0012): when an AI
 * summary for something on this ballot is published, the page re-renders its
 * server data in place, so "being researched" sections fill in without a reload.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { NewsItem } from "@/data/types";
import type { Json } from "@/lib/supabase/types";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { FEED_PAGE, initialPages, nextPage, targetKey, type PageState } from "@/lib/feeds/paging";

export interface FeedRow {
  id: string;
  type: string;
  publisher: string;
  title: string;
  excerpt: string | null;
  url: string;
  published_at: string;
  ingested_at: string;
  status: string;
  contest_ids: string[];
  candidate_ids: string[];
  /** Type-specific fields (poll numbers for type "poll"). */
  payload?: Json;
}

interface FeedState {
  rows: Map<string, FeedRow>;
  contestIds: Set<string>;
  pages: Map<string, PageState & { loading?: boolean; retryAt?: number }>;
  loadOlder: (target: { contestId?: string; candidateId?: string }) => void;
}

const FeedContext = createContext<FeedState | null>(null);

export function LiveFeedProvider({
  electionId,
  state,
  contestIds,
  researchIds,
  initial,
  children,
}: {
  electionId: string;
  /** USPS code of the ballot's state: the broadcast topic. */
  state?: string;
  contestIds: string[];
  /** Research target ids on this ballot (measures, candidates, offices). */
  researchIds?: string[];
  initial: FeedRow[];
  children: ReactNode;
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const research = useMemo(() => new Set(researchIds ?? []), [researchIds]);
  const [rows, setRows] = useState(() => new Map(initial.map((r) => [r.id, r])));
  const ids = useMemo(() => new Set(contestIds), [contestIds]);
  const [pages, setPages] = useState(() => initialPages(initial, contestIds) as FeedState["pages"]);
  // The ref is the source of truth for loadOlder (no double requests); the state re-renders carousels.
  const pagesRef = useRef(pages);
  const setPage = useCallback((key: string, p: FeedState["pages"] extends Map<string, infer V> ? V : never) => {
    pagesRef.current = new Map(pagesRef.current).set(key, p);
    setPages(pagesRef.current);
  }, []);

  const merge = useCallback((list: FeedRow[]) => {
    setRows((prev) => {
      const next = new Map(prev);
      for (const r of list) next.set(r.id, r);
      return next;
    });
  }, []);

  // Catch up after a dropped connection: merge, so older stories already paged in stay
  // (retractions arrive on the channel).
  const refetch = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().rpc("ballot_feed", {
      p_election_id: electionId,
      p_contest_ids: [...ids],
      p_per_contest: FEED_PAGE,
    });
    if (error || !data) return;
    merge(data as FeedRow[]);
  }, [electionId, ids, merge]);

  const loadOlder = useCallback(
    async (target: { contestId?: string; candidateId?: string }) => {
      const key = targetKey(target);
      const cur = pagesRef.current.get(key) ?? { cursor: null, done: false };
      if (cur.done || cur.loading || (cur.retryAt ?? 0) > Date.now()) return;
      setPage(key, { ...cur, loading: true });
      const { data, error } = await getSupabaseBrowser().rpc("feed_page", {
        p_election_id: electionId,
        p_contest_id: target.candidateId ? null : (target.contestId ?? null),
        p_candidate_id: target.candidateId ?? null,
        p_before_at: cur.cursor?.at ?? null,
        p_before_id: cur.cursor?.id ?? null,
        p_limit: FEED_PAGE,
      });
      if (error || !data) {
        // Try again the next time the carousel nears its end, at most every 10 s.
        setPage(key, { ...cur, loading: false, retryAt: Date.now() + 10_000 });
        return;
      }
      merge(data as FeedRow[]);
      setPage(key, nextPage(data as FeedRow[]));
    },
    [electionId, merge, setPage],
  );

  useEffect(() => {
    if (!ids.size || !state) return;
    const sb = getSupabaseBrowser();
    let subscribedOnce = false;
    const channel = sb
      .channel(`feed:${electionId}:${state.toUpperCase()}`)
      .on("broadcast", { event: "feed" }, ({ payload }) => {
        const row = payload as Partial<FeedRow>;
        if (!row.id) return;
        setRows((prev) => {
          const next = new Map(prev);
          if (row.status !== "published") next.delete(row.id!);
          else if ((row.contest_ids ?? []).some((c) => ids.has(c))) next.set(row.id!, row as FeedRow);
          return next;
        });
      })
      .on("broadcast", { event: "research" }, ({ payload }) => {
        const target = (payload as { target?: string }).target;
        if (!target || !research.has(target)) return;
        // Several answers often land together: refresh once, a moment later.
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 1500);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A resubscribe means we may have missed items while disconnected.
        if (subscribedOnce) void refetch();
        subscribedOnce = true;
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [electionId, state, ids, refetch, research, router]);

  const value = useMemo(() => ({ rows, contestIds: ids, pages, loadOlder }), [rows, ids, pages, loadOlder]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

function toNewsItem(r: FeedRow): NewsItem {
  return {
    id: r.id,
    type: r.type === "poll" ? "poll" : "news",
    source: r.publisher,
    title: r.title,
    excerpt: r.excerpt ?? undefined,
    url: r.url,
    date: r.published_at,
  };
}

/** Items about a contest (race-level) or a candidate (profile-level); undefined outside a provider. */
export function useFeedItems(target?: { contestId?: string; candidateId?: string }): NewsItem[] | undefined {
  const ctx = useContext(FeedContext);
  return useMemo(() => {
    if (!ctx || !target || (!target.contestId && !target.candidateId)) return undefined;
    const out: NewsItem[] = [];
    for (const r of ctx.rows.values()) {
      const hit = target.candidateId ? r.candidate_ids.includes(target.candidateId) : r.contest_ids.includes(target.contestId!);
      if (hit) out.push(toNewsItem(r));
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [ctx, target]);
}

/** Paging for one carousel: whether more may exist, whether a page is loading, and how to ask for it. */
export function useFeedPaging(target?: { contestId?: string; candidateId?: string }) {
  const ctx = useContext(FeedContext);
  const key = target && (target.contestId || target.candidateId) ? targetKey(target) : undefined;
  const page = key ? ctx?.pages.get(key) : undefined;
  const load = ctx?.loadOlder;
  const contestId = target?.contestId;
  const candidateId = target?.candidateId;
  const loadOlder = useCallback(() => load?.({ contestId, candidateId }), [load, contestId, candidateId]);
  return useMemo(
    () =>
      ctx && key
        ? {
            /** Never asked yet (a candidate's carousel starts here). */
            started: !!page,
            loading: !!page?.loading,
            done: !!page?.done,
            loadOlder,
          }
        : undefined,
    [ctx, key, page, loadOlder],
  );
}

/** Feed rows of one type for a contest, newest first (e.g. polls for the polling card). */
export function useContestRows(contestId: string | undefined, type: string): FeedRow[] {
  const ctx = useContext(FeedContext);
  return useMemo(() => {
    if (!ctx || !contestId) return [];
    return [...ctx.rows.values()].filter((r) => r.type === type && r.contest_ids.includes(contestId)).sort((a, b) => b.published_at.localeCompare(a.published_at));
  }, [ctx, contestId, type]);
}

/** When the newest item appeared on this ballot (our pickup time, not the outlet's publish time). */
export function useLatestUpdate(): Date | undefined {
  const ctx = useContext(FeedContext);
  return useMemo(() => {
    let max = 0;
    for (const r of ctx?.rows.values() ?? []) max = Math.max(max, Date.parse(r.ingested_at) || 0);
    return max ? new Date(max) : undefined;
  }, [ctx]);
}
