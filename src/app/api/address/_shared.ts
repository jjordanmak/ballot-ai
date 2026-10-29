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
 * Browsers send `Sec-Fetch-Site`; older ones send `Origin`. A request with
 * neither (a script, curl) is refused, so the endpoint can't be drained from
 * outside the site.
 */
export function sameSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Parse a same-site JSON request carrying a session token. Returns undefined
 * (→ 400/403) for anything else, so the endpoint can't be used as an open
 * Places proxy from other sites.
 */
export async function readRequest(req: Request): Promise<Record<string, unknown> | "forbidden" | undefined> {
  if (!sameSite(req)) return "forbidden";
  const body = (await req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (!body || typeof body.sessionToken !== "string" || !SESSION_TOKEN.test(body.sessionToken)) return undefined;
  return body;
}
