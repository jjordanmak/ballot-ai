import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface Election {
  id: string;
  state: string;
  date: string;       // ISO date string from Postgres
  name: string;
  type: string;
}

export async function getElection(id: string): Promise<Election | null> {
  const { data, error } = await supabaseServer
    .from("elections")
    .select("id, state, date, name, type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as Election;
}

/** All elections (used by the landing-page election dropdown). Future-dated
 * first, then past, all sorted by date descending within each group. */
export async function listElections(): Promise<Election[]> {
  const { data, error } = await supabaseServer
    .from("elections")
    .select("id, state, date, name, type")
    .order("date", { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return data as Election[];
}
