import "server-only";
import type { FeedRow } from "@/components/ballot/LiveFeed";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseServer } from "@/lib/supabase/server";
import { FEED_PAGE } from "./paging";

/** Published feed items for a ballot's contests: the newest FEED_PAGE per contest and type (public read; RLS hides held items). */
export async function initialFeed(electionId: string, contestIds: string[], perContest = FEED_PAGE): Promise<FeedRow[]> {
  if (!contestIds.length) return [];
  try {
    const { data, error } = await getSupabaseServer().rpc("ballot_feed", {
      p_election_id: electionId,
      p_contest_ids: contestIds,
      p_per_contest: perContest,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as FeedRow[]).sort((a, b) => b.published_at.localeCompare(a.published_at));
  } catch (e) {
    // The ballot still renders; news just starts empty.
    logEvent("feeds.read_failed", { error: e instanceof Error ? e.message : "unknown" });
    return [];
  }
}

export interface DiscoveredLink {
  contest_candidate_id: string;
  kind: string;
  url: string;
  verified_from: string;
  checked_at: string;
}

/** X accounts found on candidates' own campaign sites by the daily link check. */
export async function discoveredLinks(candidateIds: string[]): Promise<DiscoveredLink[]> {
  if (!candidateIds.length) return [];
  try {
    const { data, error } = await getSupabaseServer()
      .from("candidate_links")
      .select("contest_candidate_id, kind, url, verified_from, checked_at")
      .in("contest_candidate_id", candidateIds);
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (e) {
    logEvent("links.read_failed", { error: e instanceof Error ? e.message : "unknown" });
    return [];
  }
}
