/**
 * HTML → readable text, plus the links on the page. Main text only (no
 * scripts, styles, menus or footers) so the hash of a page only changes
 * when its words change, not on every timestamp or ad.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", sect: "§" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  return decode(
    main
      .replace(/<(script|style|noscript|svg|nav|footer|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

export function htmlTitle(html: string): string | undefined {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? decode(t).replace(/\s+/g, " ").trim().slice(0, 200) : undefined;
}

/** Same-site links whose visible text matches one of `wanted` (case-insensitive), in page order. */
export function findLinks(html: string, baseUrl: string, wanted: string[]): string[] {
  const base = new URL(baseUrl);
  const out: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m; (m = re.exec(html)); ) {
    const label = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().toLowerCase();
    if (!label || !wanted.some((w) => new RegExp(`\\b${w}\\b`, "i").test(label))) continue;
    try {
      const u = new URL(decode(m[1]), base);
      if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      if (u.toString() !== base.toString() && !out.includes(u.toString())) out.push(u.toString());
    } catch {
      // ignore malformed hrefs
    }
  }
  return out;
}
