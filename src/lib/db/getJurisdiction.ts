import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface Jurisdiction {
  zip: string;
  city: string | null;
  county: string | null;
  state: string;
  districts: Record<string, string | number | undefined>;
}

export async function getJurisdiction(zip: string): Promise<Jurisdiction | null> {
  const { data, error } = await supabaseServer
    .from("jurisdictions")
    .select("zip, city, county, state, districts")
    .eq("zip", zip)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    zip: data.zip,
    city: data.city,
    county: data.county,
    state: data.state,
    districts: (data.districts ?? {}) as Jurisdiction["districts"],
  };
}
