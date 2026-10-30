import { getBallotRuntime } from "@/lib/ballot/runtime";
import { parseLocations, runMatrix } from "@/lib/qa/matrix";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Last run older than this → run again. */
const EVERY_MS = 24 * 3600_000;

/**
 * Hourly (vercel.json), working at most once a day: the national test list
 * (src/lib/qa/matrix.ts). Locations come from the private env var
 * QA_CIVIC_BUILDINGS; results go to qa_runs, address-free.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const locations = parseLocations(process.env.QA_CIVIC_BUILDINGS);
  if (!locations.length) return Response.json({ skipped: "no QA_CIVIC_BUILDINGS" });
  const db = getSupabaseAdmin();
  const { data: last } = await db.from("qa_runs").select("run_at").order("run_at", { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - Date.parse(last[0].run_at) < EVERY_MS) return Response.json({ skipped: "ran in the last 24 hours" });
  const runtime = getBallotRuntime();
  const lookup = await runtime.elections.current();
  if (!lookup.ok) return Response.json({ skipped: lookup.status });
  return Response.json(await runMatrix({ db, runtime, election: lookup.election, locations }));
}
