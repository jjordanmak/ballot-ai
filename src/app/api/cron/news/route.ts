import daly from "../../../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import type { ResolvedBallot } from "@/domain/ballot";
import { SupabaseDurableRegistry } from "@/lib/ballot/durable";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { getBallotRuntime } from "@/lib/ballot/runtime";
import { collectNews } from "@/lib/feeds/collect-news";
import { NEWS_SOURCES } from "@/lib/feeds/sources";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Every 2 minutes (vercel.json): collect news for the active election. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const lookup = await getBallotRuntime().elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  const election = lookup.election;
  const db = getSupabaseAdmin();

  // Track the reference ballot's contests (all CA statewide + Daly City local) even before anyone looks one up.
  const { count } = await db.from("contests").select("id", { count: "exact", head: true }).eq("election_id", election.id);
  // Only for the reference ballot's own election; never relabeled onto another one.
  if (!count && election.slug === daly.election?.slug) {
    const seed = structuredClone(daly) as unknown as ResolvedBallot;
    seed.election = election;
    await new SupabaseDurableRegistry().register(seed, getEnrichment(election.slug));
  }

  const summary = await collectNews({
    db,
    electionId: election.id,
    sources: NEWS_SOURCES,
    publish: process.env.FEEDS_PUBLISH !== "off",
  });
  return Response.json(summary);
}
