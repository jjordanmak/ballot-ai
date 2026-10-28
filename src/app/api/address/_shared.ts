import "server-only";
import { GooglePlacesClient } from "@/lib/providers/google-places/client";

export const places = new GooglePlacesClient();

const SESSION_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Address lookups are never cached or indexed anywhere. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" },
  });
}

/**
 * Parse a same-site JSON request carrying a session token. Returns undefined
 * (→ 400/403) for anything else, so the endpoint can't be used as an open
 * Places proxy from other sites.
 */
export async function readRequest(req: Request): Promise<Record<string, unknown> | "forbidden" | undefined> {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return "forbidden";
  const body = (await req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (!body || typeof body.sessionToken !== "string" || !SESSION_TOKEN.test(body.sessionToken)) return undefined;
  return body;
}
