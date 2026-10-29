/**
 * Finds an outlet's current feed when its listed feed URL has moved (404/410)
 * or now returns a web page. Reads only the outlet's own advertised feeds:
 * `<link rel="alternate" type="application/rss+xml|atom+xml">` on the page
 * that came back and on the site's homepage. Same site only (the outlet's own
 * domain, including its subdomains such as rss.wbur.org or ww2.kqed.org).
 */
import { looksLikeFeed } from "./parse";
import { safeFetch, type Resolver } from "./safeFetch";

const FEED_TYPE = /application\/(rss|atom)\+xml/i;

/** The registrable domain: "rss.wbur.org" → "wbur.org", "news.bbc.co.uk" → "bbc.co.uk". */
export function siteOf(host: string): string {
  const p = host.toLowerCase().split(".");
  const n = p.length > 2 && p[p.length - 1].length === 2 && p[p.length - 2].length <= 3 ? 3 : 2;
  return p.slice(-n).join(".");
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];

/** Feed links a page advertises, best match for `original` first. Other sites' feeds are ignored. */
export function advertisedFeeds(html: string, pageUrl: string, original: string): string[] {
  const page = new URL(pageUrl);
  const found: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\balternate\b/i.test(attr(tag, "rel") ?? "") || !FEED_TYPE.test(attr(tag, "type") ?? "")) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), page);
      if (!/^https?:$/.test(u.protocol) || siteOf(u.hostname) !== siteOf(page.hostname)) continue;
      if (!found.includes(u.toString())) found.push(u.toString());
    } catch {
      // ignore malformed hrefs
    }
  }
  // Prefer the feed that shares the original's section path, then politics feeds, then the rest in page order.
  const segments = new URL(original).pathname.split("/").filter((s) => s.length > 2 && !/^(feed|rss|xml|arc|outboundfeeds|category)$/i.test(s));
  const score = (u: string) => {
    const path = new URL(u).pathname.toLowerCase();
    // The most specific section (the last path segment) counts most.
    const shared = segments.reduce((n, seg, i) => n + (path.includes(seg.toLowerCase()) ? (i === segments.length - 1 ? 3 : 1) : 0), 0);
    return shared * 2 + (/politic|elect|government/.test(path) ? 1 : 0);
  };
  return found.map((u, i) => ({ u, i, s: score(u) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.u);
}

/**
 * The first advertised feed that really is a feed, looking at the page the
 * listed URL returned (if HTML) and then the homepage. Null when the outlet
 * advertises none.
 */
export async function discoverFeed(
  original: string,
  returnedHtml: string | undefined,
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver; userAgent: string; timeoutMs: number },
): Promise<string | null> {
  const get = async (url: string) => {
    try {
      const res = await safeFetch(
        url,
        { headers: { "user-agent": deps.userAgent }, signal: AbortSignal.timeout(deps.timeoutMs), maxBytes: 2_000_000 },
        { fetchImpl: deps.fetchImpl, resolve: deps.resolve },
      );
      return res.ok ? (res.text ?? "") : null;
    } catch {
      return null;
    }
  };
  const candidates: string[] = [];
  if (returnedHtml) candidates.push(...advertisedFeeds(returnedHtml, original, original));
  const home = new URL("/", original).toString();
  const homeHtml = await get(home);
  if (homeHtml) for (const u of advertisedFeeds(homeHtml, home, original)) if (!candidates.includes(u)) candidates.push(u);
  for (const u of candidates.filter((c) => c !== original).slice(0, 3)) {
    const body = await get(u);
    if (body && looksLikeFeed(body)) return u;
  }
  return null;
}
