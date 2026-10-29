/**
 * Supabase ADMIN client (service-role key, bypasses Row-Level Security).
 *
 * USE WITH CARE. Only call from:
 *   - Seed scripts (`npm run seed`)
 *   - Server actions that persist address-free ballot resolutions
 *   - Cron job route handlers (`/api/cron/*`)
 *
 * NEVER import from a "use client" file — `server-only` fails the build.
 *
 * Created lazily so a missing key fails the call that needs it, not every
 * page that happens to import a module depending on this file.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing admin Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
