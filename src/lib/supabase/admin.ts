/**
 * Supabase ADMIN client (service-role key, bypasses Row-Level Security).
 *
 * USE WITH CARE. Only call from:
 *   - Seed scripts (`npm run seed`)
 *   - Cron job route handlers (`/api/cron/*`)
 *   - Server-side data ingestion
 *
 * NEVER import from a "use client" file. Throws if attempted in the
 * browser.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Missing admin Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

export const supabaseAdmin = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
