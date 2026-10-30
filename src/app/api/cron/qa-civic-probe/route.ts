import { getBallotRuntime } from "@/lib/ballot/runtime";
import { runCivicProbe } from "@/lib/qa/civicProbe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Every 5 minutes (vercel.json) until done: the one-time Google election-id
 * diagnosis (src/lib/qa/civicProbe.ts), about 12 states a run. Does nothing
 * once all states are stored; remove the cron entry afterwards.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  return Response.json(await runCivicProbe({ db: getSupabaseAdmin(), election: lookup.election }));
}
