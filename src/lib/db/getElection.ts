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

/** All elections sorted by date descending. */
export async function listElections(): Promise<Election[]> {
  const { data, error } = await supabaseServer
    .from("elections")
    .select("id, state, date, name, type")
    .order("date", { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return data as Election[];
}

/** Elections for a specific state, future-first then past. */
export async function listElectionsByState(state: string): Promise<Election[]> {
  const { data, error } = await supabaseServer
    .from("elections")
    .select("id, state, date, name, type")
    .eq("state", state)
    .order("date", { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return data as Election[];
}
