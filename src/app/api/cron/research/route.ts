import { getBallotRuntime } from "@/lib/ballot/runtime";
import { aiConfig } from "@/lib/ai/config";
import { runResearch } from "@/lib/research/run";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hourly (vercel.json, production only): researches new contests and ones
 * whose documents changed (docs/architecture/AI_ARCHITECTURE.md). Off unless
 * AI_SYNTHESIS_ENABLED=on and ANTHROPIC_API_KEY is set.
 *
 * Manual runs (e.g. on a preview, with the cron secret): ?limit=3 caps how
 * many targets call Claude; ?only=<id>,<id> limits the run to those targets.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const cfg = aiConfig();
  if (!cfg.enabled) return Response.json({ skipped: "AI synthesis is off (AI_SYNTHESIS_ENABLED / ANTHROPIC_API_KEY)" });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  const params = new URL(req.url).searchParams;
  const limit = Number(params.get("limit"));
  const only = params.get("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const summary = await runResearch({
    db: getSupabaseAdmin(),
    electionId: lookup.election.id,
    config: cfg,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : undefined,
    only,
  });
  return Response.json(summary);
}
