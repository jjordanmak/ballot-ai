import "server-only";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { previewFields } from "./preview";
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

/**
 * One writing round's held results for these ids (`?preview=`, previews and
 * local only; the caller checks). Service role: held rows aren't public.
 */
export async function heldResearch(targetIds: string[], setting: string): Promise<ResearchRow[]> {
  if (!targetIds.length) return [];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("synthesized_field_versions")
      .select("target_id, payload")
      .in("target_id", targetIds)
      .in("field_name", previewFields(setting))
      .eq("is_current", true);
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (e) {
    logEvent("research.preview_read_failed", { error: e instanceof Error ? e.message : "unknown" });
    return [];
  }
}
