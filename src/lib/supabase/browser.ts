/**
 * Supabase browser-side client (anon key).
 *
 * Use ONLY from Client Components ("use client"). The single shared
 * instance is what enables Realtime subscriptions to work — multiple
 * createClient() calls would each open their own websocket.
 *
 * For server-side fetching, use `server.ts` instead.
 */
"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: ReturnType<typeof createClient<Database>> | undefined;

export function getSupabaseBrowser() {
  if (!client) {
    client = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
