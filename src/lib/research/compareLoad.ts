import "server-only";
import { aiConfig, ROUND_CONFIG, settingId, type Setting } from "@/lib/ai/config";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComparison, coordinates, type CellInput, type RunInfo } from "./compareReview";
import { runSet } from "./runSet";
import type { Payload } from "./verify";

/**
 * Reads the comparison results (held rows, never served on ballot pages)
 * for /internal/compare. Service role only: held rows aren't public.
 */
export async function loadComparison(db: SupabaseClient<Database>, settings: Setting[] = aiConfig().compare, setName: string = ROUND_CONFIG.runSet) {
  const set = runSet(setName);
  const targets = set.targets;
  const ids = settings.map(settingId);
  const coords = targets.map((t) => ({ t, ...coordinates(t.key) }));
  const targetIds = [...new Set(coords.map((c) => c.targetId))];
  const stateKeys = targets.flatMap((t) => ids.map((s) => `${t.key}@${s}`));

  const [versions, runs, states] = await Promise.all([
    db
      .from("synthesized_field_versions")
      .select("target_type, target_id, field_name, payload, synthesis_run_id")
      .in("target_id", targetIds)
      .like("field_name", "%@%")
      .eq("is_current", true),
    db
      .from("synthesis_runs")
      .select("id, target_type, target_id, field_name, status, error, metadata, started_at")
      .in("target_id", targetIds)
      .like("field_name", "%@%")
      .order("started_at", { ascending: false })
      .limit(5000),
    db.from("research_state").select("key, last_outcome").in("key", stateKeys),
  ]);

  // field_name "measure@model:effort" on target measure:<id> → state key "measure:<id>:measure@model:effort".
  const keyOf = (r: { target_type: string; target_id: string; field_name: string }) => `${r.target_type}:${r.target_id}:${r.field_name}`;
  const cells = new Map<string, CellInput>();
  const cell = (k: string) => {
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { stateKey: k }));
    return c;
  };
  for (const s of states.data ?? []) cell(s.key).outcome = s.last_outcome;
  // Newest run per cell: its cost, time and rejected answers (failed runs included).
  for (const r of runs.data ?? []) {
    const c = cell(keyOf(r));
    if (c.run) continue;
    c.run = (r.metadata ?? {}) as RunInfo;
    if (r.status === "failed" && !c.outcome) c.outcome = "failed";
  }
  for (const v of versions.data ?? []) cell(keyOf(v)).payload = v.payload as unknown as Payload;

  const failures = [versions.error, runs.error, states.error].filter(Boolean).map((e) => e!.message);
  return { ballot: set.ballot, settings, ...buildComparison(targets, settings, cells), failures };
}
