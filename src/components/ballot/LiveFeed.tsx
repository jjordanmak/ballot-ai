"use client";

/**
 * One Realtime subscription per ballot page. New, updated and retracted
 * `feed_items` for this election stream in; each "In the news" carousel and
 * the "Last updated" stat read from here instead of opening their own
 * channels (a ballot has ~75 news sections; Supabase caps channels per client).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NewsItem } from "@/data/types";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
}

interface FeedState {
  rows: Map<string, FeedRow>;
  contestIds: Set<string>;
}

const FeedContext = createContext<FeedState | null>(null);

export function LiveFeedProvider({
  electionId,
  contestIds,
  initial,
  children,
}: {
  electionId: string;
  contestIds: string[];
  initial: FeedRow[];
  children: ReactNode;
}) {
  const [rows, setRows] = useState(() => new Map(initial.map((r) => [r.id, r])));
  const ids = useMemo(() => new Set(contestIds), [contestIds]);

  useEffect(() => {
    if (!ids.size) return;
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel(`feed-${electionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_items", filter: `election_id=eq.${electionId}` }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Partial<FeedRow>;
        if (!row.id) return;
        setRows((prev) => {
          const next = new Map(prev);
          if (payload.eventType === "DELETE" || row.status !== "published") next.delete(row.id!);
          else if ((row.contest_ids ?? []).some((c) => ids.has(c))) next.set(row.id!, row as FeedRow);
          return next;
        });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [electionId, ids]);

  const value = useMemo(() => ({ rows, contestIds: ids }), [rows, ids]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

function toNewsItem(r: FeedRow): NewsItem {
  return {
    id: r.id,
    type: r.type === "news" ? "news" : (r.type as NewsItem["type"]),
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
    return out;
  }, [ctx, target]);
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
