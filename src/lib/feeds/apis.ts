/**
 * News found through APIs, for outlets whose pages we can't read (owner,
 * 2026-10-30): the New York Times Article Search API and GDELT's DOC API
 * (which indexes Politico, The Hill, WSJ, Bloomberg, NPR, AP and others).
 * Both are queried by candidate name, so a story that names someone only
 * in its body still reaches their profile. Pure: queries and parsers here,
 * fetching and storage in collect-apis.ts.
 *
 * GDELT returns only the URL, title and date (it reads the article for us);
 * the query itself carries the identity rules our matcher applies to text we
 * read: the full name, at least one word identifying the race, and the last
 * name at least twice.
 */
import type { CandidateQuery } from "./match";

export const NYT_ENDPOINT = "https://api.nytimes.com/svc/search/v2/articlesearch.json";
export const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface ApiArticle {
  title: string;
  link: string;
  published?: Date;
  summary?: string;
  /** Lead paragraph or snippet, for matching only (never stored). */
  body?: string;
  /** People the publisher itself tagged in the article ("Becerra, Xavier"). */
  persons?: string[];
  /** Publisher's own label, e.g. "Op-Ed" or "News". */
  kind?: string;
  domain?: string;
}

const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t);

/**
 * `"Xavier Becerra" (governor OR california OR hilton) repeat2:"becerra" (domainis:politico.com OR …)`.
 * A local race's context is its own place (or an opponent), never just the state.
 */
export function gdeltQuery(c: CandidateQuery, domains: string[]): string {
  const ctx = c.stateLevel ? c.context : c.context.filter((t) => t !== "california" && !STATE_WORDS.has(t));
  const parts = [`"${c.name}"`];
  if (ctx.length) parts.push(ctx.length === 1 ? quote(ctx[0]) : `(${ctx.map(quote).join(" OR ")})`);
  parts.push(`repeat2:"${c.surname.toLowerCase()}"`);
  if (domains.length) parts.push(domains.length === 1 ? `domainis:${domains[0]}` : `(${domains.map((d) => `domainis:${d}`).join(" OR ")})`);
  return parts.join(" ");
}

/** State names are fine context for a statewide race but too broad for a local one. */
const STATE_WORDS = new Set(["alabama", "alaska", "arizona", "arkansas", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia"]);

export function gdeltUrl(query: string, timespan = "3d"): string {
  const p = new URLSearchParams({ query, mode: "artlist", format: "json", timespan, maxrecords: "50", sort: "datedesc" });
  return `${GDELT_ENDPOINT}?${p}`;
}

/** GDELT answers a too-fast caller with a plain-text note instead of JSON. */
export function isGdeltThrottle(body: string): boolean {
  return /limit requests to one every/i.test(body);
}

/** GDELT tokenizes titles ("Prop . 40 is about 0 . 07 %"); put the punctuation back. */
export function tidyGdeltTitle(t: string): string {
  return t
    .replace(/\s+([.,:;!?%)\]])/g, "$1")
    .replace(/([([$])\s+/g, "$1")
    .replace(/(\d)\.\s+(\d)/g, "$1.$2")
    .replace(/\s+'\s*s\b/g, "'s")
    .replace(/\s+/g, " ")
    .trim();
}

/** "20261024T081500Z" → Date. */
function gdeltDate(s: string | undefined): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : undefined;
}

export function parseGdelt(body: string): ApiArticle[] {
  let data: { articles?: { url?: string; title?: string; seendate?: string; domain?: string; language?: string }[] };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  return (data.articles ?? []).flatMap((a) =>
    a.url && a.title && (!a.language || /english/i.test(a.language))
      ? [{ title: tidyGdeltTitle(a.title), link: a.url, published: gdeltDate(a.seendate), domain: a.domain?.toLowerCase() }]
      : [],
  );
}

/** Article Search for one person, newest first, from `since` on. */
export function nytUrl(c: CandidateQuery, key: string, since: Date): string {
  const d = since.toISOString().slice(0, 10).replace(/-/g, "");
  const p = new URLSearchParams({ q: `"${c.name}"`, begin_date: d, sort: "newest", "api-key": key });
  return `${NYT_ENDPOINT}?${p}`;
}

interface NytDoc {
  web_url?: string;
  url?: string;
  headline?: { main?: string };
  abstract?: string;
  snippet?: string;
  lead_paragraph?: string;
  pub_date?: string;
  type_of_material?: string;
  keywords?: { name?: string; value?: string }[];
}

export function parseNyt(body: string): ApiArticle[] {
  let data: { response?: { docs?: NytDoc[] | null } };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  return (data.response?.docs ?? []).flatMap((d) => {
    const link = d.web_url ?? d.url;
    const title = d.headline?.main?.trim();
    if (!link || !title) return [];
    const t = d.pub_date ? Date.parse(d.pub_date) : NaN;
    return [
      {
        title,
        link,
        published: Number.isNaN(t) ? undefined : new Date(t),
        summary: d.abstract?.trim() || d.snippet?.trim() || undefined,
        body: [d.lead_paragraph, d.snippet].filter(Boolean).join(" ") || undefined,
        persons: (d.keywords ?? []).filter((k) => /^persons?$/i.test(k.name ?? "")).map((k) => k.value ?? "").filter(Boolean),
        kind: d.type_of_material,
      },
    ];
  });
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Whether the NYT tagged this person ("Becerra, Xavier" or "Becerra, Xavier (1958- )"). */
export function nytTagged(persons: string[] | undefined, c: Pick<CandidateQuery, "first" | "surname">): boolean {
  const first = norm(c.first);
  const last = norm(c.surname);
  return (persons ?? []).some((p) => {
    const [l, f = ""] = p.split(",");
    return norm(l) === last && norm(f).split(" ").includes(first);
  });
}

/** Opinion and sponsored pieces are held, as the feed checks do for headlines. */
export function isOpinionKind(kind: string | undefined): boolean {
  return /op-?ed|opinion|editorial|letter|column|review|sponsored|advertis/i.test(kind ?? "");
}
