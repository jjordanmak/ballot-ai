import { getEnrichment } from "@/lib/ballot/enrichment";
import { getBallotRuntime } from "@/lib/ballot/runtime";
import { recheckPublished } from "@/lib/feeds/collect-news";
import { discoverXLinks } from "@/lib/feeds/links";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily (vercel.json): retract published articles whose pages are gone, and
 * check candidates' campaign sites for their X account (each weekly). Each
 * half has its own time budget inside the 300-second limit.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const db = getSupabaseAdmin();
  const recheck = await recheckPublished(db, { budgetMs: 150_000 });
  const lookup = await getBallotRuntime().elections.current();
  const links = lookup.ok ? await discoverXLinks(db, lookup.election.id, getEnrichment(lookup.election.slug), { budgetMs: 100_000 }) : { skipped: lookup.status };
  return Response.json({ recheck, links });
}
