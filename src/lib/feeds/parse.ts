/**
 * RSS 2.0 / Atom → plain entries. Text is stripped of HTML; entity
 * expansion is left to fast-xml-parser's defaults (bounded).
 */
import { XMLParser } from "fast-xml-parser";

export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  published?: Date;
  categories: string[];
  image?: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

function text(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  if (typeof x === "object" && "#text" in (x as Record<string, unknown>)) return String((x as Record<string, unknown>)["#text"] ?? "");
  return "";
}

/** Remove tags and decode the handful of entities feeds actually use. */
export function plainText(html: string): string {
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function date(...xs: unknown[]): Date | undefined {
  for (const x of xs) {
    const t = Date.parse(text(x));
    if (!Number.isNaN(t)) return new Date(t);
  }
  return undefined;
}

type Node = Record<string, unknown>;

export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Node;
  const rss = (doc.rss as Node | undefined)?.channel as Node | undefined;
  if (rss) {
    return asArray(rss.item as Node | Node[]).flatMap((it) => {
      const link = text(it.link) || text((it.guid as Node | undefined) ?? it.guid);
      const title = plainText(text(it.title));
      if (!link || !title) return [];
      const media = (asArray(it["media:content"] as Node | Node[])[0] ?? asArray(it["media:thumbnail"] as Node | Node[])[0]) as Node | undefined;
      const enclosure = it.enclosure as Node | undefined;
      return [
        {
          title,
          link: link.trim(),
          summary: plainText(text(it.description) || text(it["content:encoded"])).slice(0, 600),
          published: date(it.pubDate, it["dc:date"], it.published),
          categories: asArray(it.category as unknown).map((c) => plainText(text(c))).filter(Boolean),
          image: (media?.["@_url"] as string | undefined) ?? (enclosure?.["@_type"]?.toString().startsWith("image") ? (enclosure["@_url"] as string) : undefined),
        },
      ];
    });
  }
  const atom = doc.feed as Node | undefined;
  if (atom) {
    return asArray(atom.entry as Node | Node[]).flatMap((e) => {
      const links = asArray(e.link as Node | Node[]);
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const link = (alt?.["@_href"] as string | undefined) ?? "";
      const title = plainText(text(e.title));
      if (!link || !title) return [];
      return [
        {
          title,
          link: link.trim(),
          summary: plainText(text(e.summary) || text(e.content)).slice(0, 600),
          published: date(e.published, e.updated),
          categories: asArray(e.category as Node | Node[]).map((c) => String(c["@_term"] ?? "")).filter(Boolean),
        },
      ];
    });
  }
  return [];
}
