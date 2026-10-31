import { getBallotRuntime } from "@/lib/ballot/runtime";
import { NEWS_SOURCES } from "@/lib/feeds/sources";
import { runGdeltProbe } from "@/lib/qa/gdeltProbe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Every 15 minutes (vercel.json) until done: the one-time GDELT data-file
 * check (src/lib/qa/gdeltProbe.ts), a 24-hour replay in one run. Does
 * nothing once its row is stored; remove the cron entry afterwards.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  return Response.json(await runGdeltProbe({ db: getSupabaseAdmin(), electionId: lookup.election.id, sources: NEWS_SOURCES }));
}
