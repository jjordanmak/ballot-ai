/**
 * Where the research dispatcher sends each job. A cron runs on the
 * deployment's own URL, which sits behind Vercel's deployment protection,
 * so in production jobs go to the production domain instead (public).
 * Elsewhere (a manual run on a preview) the request's origin is used, with
 * Vercel's automation bypass header when that secret is set.
 */
export function jobRequest(reqUrl: string, key: string, auth: string, env: Record<string, string | undefined> = process.env): { url: string; headers: Record<string, string> } {
  const prod = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined;
  const origin = prod ? `https://${prod.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : new URL(reqUrl).origin;
  const headers: Record<string, string> = { authorization: auth };
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass && !prod) headers["x-vercel-protection-bypass"] = bypass;
  return { url: `${origin}/api/cron/research?job=${encodeURIComponent(key)}`, headers };
}
