import { getBallotRuntime } from "@/lib/ballot/runtime";
import { runCountySweep } from "@/lib/qa/countySweep";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Every 5 minutes (vercel.json) until done: the one-time county sweep
 * (src/lib/qa/countySweep.ts), about 40 counties a run. Once every county
 * is stored it does nothing; remove the cron entry afterwards.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const runtime = getBallotRuntime();
  const lookup = await runtime.elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  return Response.json(await runCountySweep({ db: getSupabaseAdmin(), runtime, election: lookup.election }));
}
