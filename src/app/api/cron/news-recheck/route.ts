import { getEnrichment } from "@/lib/ballot/enrichment";
import { getBallotRuntime } from "@/lib/ballot/runtime";
import { recheckPublished } from "@/lib/feeds/collect-news";
import { discoverXLinks } from "@/lib/feeds/links";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily (vercel.json): retract published articles whose pages are gone, and
 * look for X accounts on candidates' own campaign sites.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const db = getSupabaseAdmin();
  const recheck = await recheckPublished(db);
  const lookup = await getBallotRuntime().elections.current();
  const links = lookup.ok ? await discoverXLinks(db, lookup.election.id, getEnrichment(lookup.election.slug)) : { skipped: lookup.status };
  return Response.json({ recheck, links });
}
