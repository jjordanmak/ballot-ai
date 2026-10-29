import "server-only";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ResearchRow } from "./research";

/** Published, current research for these durable ids (public read; RLS hides held and old versions). */
export async function publishedResearch(targetIds: string[]): Promise<ResearchRow[]> {
  if (!targetIds.length) return [];
  try {
    const { data, error } = await getSupabaseServer()
      .from("synthesized_field_versions")
      .select("target_id, payload")
      .in("target_id", targetIds)
      .eq("is_current", true)
      .eq("status", "published");
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (e) {
    // The ballot still renders with curated content only.
    logEvent("research.read_failed", { error: e instanceof Error ? e.message : "unknown" });
    return [];
  }
}
