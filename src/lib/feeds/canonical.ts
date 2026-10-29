/** Tracking parameters stripped before de-duplicating articles by URL. */
const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|cmpid|taid|ito|ref|ref_src|smid|smtyp|cid|output|outputtype)$/i;

/**
 * Stable form of an article URL for de-duplication: https/http only, no
 * fragment, no tracking parameters, lowercase host, no trailing slash.
 * Returns undefined for anything that isn't a web URL.
 */
export function canonicalUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let s = u.toString();
  if (u.pathname !== "/" && s.endsWith("/") && !u.search) s = s.slice(0, -1);
  return s;
}
