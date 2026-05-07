import { NextResponse } from "next/server";
import { resolveZip } from "@/lib/db/resolveZip";

/**
 * Resolve a ZIP to its canonical jurisdiction. Used by the landing-page
 * form to filter the election dropdown by state once the user has typed
 * their ZIP.
 *
 * Hits the Supabase `jurisdictions` cache first; falls back to the US
 * Census Bureau geocoder + writes the result back to cache.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zip: string }> }
) {
  const { zip } = await params;
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "invalid_zip" }, { status: 400 });
  }
  const j = await resolveZip(zip);
  if (!j) {
    return NextResponse.json({ error: "unknown_zip" }, { status: 404 });
  }
  return NextResponse.json({
    zip: j.zip,
    state: j.state,
    city: j.city,
    county: j.county,
  });
}
