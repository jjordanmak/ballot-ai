import "server-only";
import type { FeedRow } from "@/components/ballot/LiveFeed";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Published feed items for a ballot's contests (public read; RLS hides held items). */
export async function initialFeed(electionId: string, contestIds: string[]): Promise<FeedRow[]> {
  if (!contestIds.length) return [];
  try {
    const { data, error } = await getSupabaseServer()
      .from("feed_items")
      .select("id, type, publisher, title, excerpt, url, published_at, ingested_at, status, contest_ids, candidate_ids")
      .eq("election_id", electionId)
      .eq("status", "published")
      .overlaps("contest_ids", contestIds)
      .order("published_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as FeedRow[];
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
