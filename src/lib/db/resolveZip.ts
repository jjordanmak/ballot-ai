import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export interface ResolvedJurisdiction {
  zip: string;
  city: string | null;
  state: string;
  county: string | null;
  districts: {
    state?: string;
    county?: string;
    us_house?: number;
    state_assembly?: number;
    state_senate?: number;
    boe?: number;
    supervisor?: number;
    city?: string;
  };
}

/**
 * Resolve a ZIP to its districts. Order of attempts:
 *   1. Already cached in `jurisdictions` table → return immediately.
 *   2. US Census Bureau Geocoder (free, no key) → resolve to county/state.
 *   3. (TODO) State-specific lookup tables for congressional / assembly /
 *      senate / BOE district. For now we can't get those from Census
 *      alone — placeholder until we add a per-state district file.
 *
 * Cached results are upserted back into the `jurisdictions` table so
 * future requests are instant.
 */
export async function resolveZip(zip: string): Promise<ResolvedJurisdiction | null> {
  // Validate first
  if (!/^\d{5}$/.test(zip)) return null;

  // 1. Cache hit
  const { data: cached } = await supabaseServer
    .from("jurisdictions")
    .select("zip, city, county, state, districts")
    .eq("zip", zip)
    .maybeSingle();
  if (cached) {
    return {
      zip: cached.zip,
      city: cached.city,
      county: cached.county,
      state: cached.state,
      districts: (cached.districts ?? {}) as ResolvedJurisdiction["districts"],
    };
  }

  // 2. Census Bureau Geocoder. Free, ~200ms, no rate limit at low volume.
  // Endpoint: https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
  // We use ZIP-only lookup which returns lat/lng + state/county/place.
  const census = await fetchCensusByZip(zip);
  if (!census) return null;

  // 3. District resolution — Census doesn't directly return CA Assembly /
  // Senate / BOE / Supervisor districts. For ZIPs in California we'd need
  // a per-state district file (e.g. from the California Citizens
  // Redistricting Commission). That's deferred until the multi-state
  // expansion. For now: known CA ZIPs in San Mateo County are wired to
  // their districts via the seed file; other CA ZIPs return statewide
  // races only.
  const districts = await resolveDistricts(zip, census.state, census.county);

  // 4. Upsert into Supabase so the next request is a cache hit. Uses the
  // service-role client (bypasses RLS).
  const row = {
    zip,
    city: census.city,
    county: census.county,
    state: census.state,
    districts: districts as Record<string, string | number | undefined>,
  };
  const { error } = await supabaseAdmin
    .from("jurisdictions")
    .upsert(row, { onConflict: "zip" });
  if (error) {
    // Non-fatal — return the resolved data anyway.
    console.warn("Failed to cache jurisdiction:", error.message);
  }

  return row;
}

/* ─── US Census Geocoder ──────────────────────────────────────────── */

/**
 * Use the Census Bureau's address geocoder. We pass `format=json`,
 * `benchmark=Public_AR_Current`, and the ZIP as the address.
 * Returns the first match's state, county name, and city ("place").
 */
async function fetchCensusByZip(zip: string): Promise<{
  city: string | null;
  state: string;
  county: string | null;
} | null> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.searchParams.set("address", zip);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, { headers: { "user-agent": "ballot.ai/1.0" } });
    if (!res.ok) return null;
    const json = await res.json();
    const match = json?.result?.addressMatches?.[0];
    if (!match) return null;
    const geo = match.geographies ?? {};
    const counties = geo["Counties"] ?? [];
    const places = geo["Incorporated Places"] ?? geo["Census Designated Places"] ?? [];
    const states = geo["States"] ?? [];
    return {
      city: places[0]?.NAME ?? null,
      state: states[0]?.STUSAB ?? null,
      county: counties[0]?.NAME?.replace(/\s+County$/, "") ?? null,
    };
  } catch {
    return null;
  }
}

/* ─── District resolution ────────────────────────────────────────── */

// Static lookup for the demo. Real version pulls from a state-level file
// (CCRC for CA, Texas SOS, etc.) keyed by ZIP.
const STATIC_DISTRICTS: Record<string, ResolvedJurisdiction["districts"]> = {
  // San Mateo County, Daly City
  "94015": {
    us_house: 15,
    state_assembly: 19,
    state_senate: 13,
    boe: 2,
    supervisor: 5,
  },
};

async function resolveDistricts(
  zip: string,
  state: string | null,
  county: string | null
): Promise<ResolvedJurisdiction["districts"]> {
  const known = STATIC_DISTRICTS[zip];
  if (known) {
    return {
      state: state ?? undefined,
      county: county ?? undefined,
      ...known,
    };
  }
  return {
    state: state ?? undefined,
    county: county ?? undefined,
  };
}
