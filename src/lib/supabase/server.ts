/**
 * Supabase server-side client (anon key).
 *
 * Use from React Server Components and Route Handlers. Reads enforce
 * Row-Level Security; writes are blocked unless RLS allows them.
 *
 * For privileged ingestion (seed scripts, cron jobs) use `admin.ts`
 * which uses the service-role key and bypasses RLS.
 *
 * Created lazily: a missing env var fails the query that needs Supabase,
 * not every module that imports this file (fixture mode runs without it).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

export function getSupabaseServer(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }
  client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  return client;
}

/** Back-compat lazy handle for existing call sites (`supabaseServer.from(...)`). */
export const supabaseServer = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const c = getSupabaseServer();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
