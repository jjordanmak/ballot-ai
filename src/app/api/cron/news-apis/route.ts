import { getBallotRuntime } from "@/lib/ballot/runtime";
import { collectApiNews } from "@/lib/feeds/collect-apis";
import { NEWS_SOURCES } from "@/lib/feeds/sources";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Every 2 minutes (vercel.json): news found by search: the NYT by candidate name, GDELT by race. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  const summary = await collectApiNews({
    db: getSupabaseAdmin(),
    electionId: lookup.election.id,
    sources: NEWS_SOURCES,
    nytKey: process.env.NYT_API_KEY,
    publish: process.env.FEEDS_PUBLISH !== "off",
  });
  return Response.json(summary);
}
