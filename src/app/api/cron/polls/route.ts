import { getBallotRuntime } from "@/lib/ballot/runtime";
import { collectPolls } from "@/lib/feeds/polls";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Every 20 minutes (vercel.json): polls for tracked contests from Wikipedia's election pages. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  const summary = await collectPolls({
    db: getSupabaseAdmin(),
    electionId: lookup.election.id,
    publish: process.env.FEEDS_PUBLISH !== "off",
  });
  return Response.json(summary);
}
