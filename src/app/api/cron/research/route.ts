import { getBallotRuntime } from "@/lib/ballot/runtime";
import { aiConfig } from "@/lib/ai/config";
import { dispatch, runJob } from "@/lib/research/run";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Research (docs/architecture/AI_ARCHITECTURE.md). Off unless
 * AI_SYNTHESIS_ENABLED=on and ANTHROPIC_API_KEY is set.
 *
 * - Every minute (vercel.json, production only), with no `job`: the
 *   dispatcher claims the jobs that are due and calls this route once per
 *   job, in parallel, so each gets its own time limit.
 * - `?job=<key>`: one job (target × model setting). Same cron secret.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const cfg = aiConfig();
  if (!cfg.enabled) return Response.json({ skipped: "AI synthesis is off (AI_SYNTHESIS_ENABLED / ANTHROPIC_API_KEY)" });
  const db = getSupabaseAdmin();
  const job = new URL(req.url).searchParams.get("job");
  if (job) return Response.json(await runJob({ db, electionId: "", config: cfg }, job));

  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  const origin = new URL(req.url).origin;
  const auth = req.headers.get("authorization") ?? "";
  const summary = await dispatch({
    db,
    electionId: lookup.election.id,
    electionSlug: lookup.election.slug ?? undefined,
    config: cfg,
    runRemote: (key) =>
      fetch(`${origin}/api/cron/research?job=${encodeURIComponent(key)}`, {
        headers: { authorization: auth },
        signal: AbortSignal.timeout(290_000),
      }).catch(() => undefined),
  });
  return Response.json(summary);
}
