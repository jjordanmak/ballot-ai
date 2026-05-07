/**
 * Supabase server-side client (anon key).
 *
 * Use from React Server Components and Route Handlers. Reads enforce
 * Row-Level Security; writes are blocked unless RLS allows them.
 *
 * For privileged ingestion (seed scripts, cron jobs) use `admin.ts`
 * which uses the service-role key and bypasses RLS.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

export const supabaseServer = createClient<Database>(url, anonKey, {
  auth: { persistSession: false },
});
