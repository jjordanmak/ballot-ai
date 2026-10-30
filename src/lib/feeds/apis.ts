/**
 * News found through APIs, for outlets whose pages we can't read (owner,
 * 2026-10-30): the New York Times Article Search API and GDELT's DOC API
 * (which indexes Politico, The Hill, WSJ, Bloomberg, NPR, AP and others).
 * They search article text, so a story that names someone only in its body
 * still reaches their race. Pure: queries and parsers here, fetching and
 * storage in collect-apis.ts.
 *
 * GDELT returns only the URL, title and date (it reads the article for us);
 * the query itself carries the identity rules our matcher applies to text we
 * read: a candidate's full name, at least one word identifying the race, and
 * the office named at least twice. The NYT is asked one person at a time.
 */
import { candidateQueries, contestTier, measureIds, officeTerms, placeTerm, STATE_NAMES, type CandidateQuery, type TrackedContest } from "./match";
import { normalizeForMatch } from "@/domain/text";

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
 * One GDELT search per race (owner-approved fix, 2026-10-30: per-person
 * searches got throttled). A story attaches to the race, and to a candidate
 * only when its headline names them.
 */
export interface RaceQuery {
  contestId: string;
  state?: string;
  tier: 0 | 1 | 2;
  /** Candidates' full names, or a measure's identifiers ("proposition 40", "prop 40"). */
  phrases: string[];
  people: { candidateId: string; surname: string }[];
  /** Office words and the place or state; one must appear. */
  context: string[];
  /** A one-word office term the story must use at least twice ("governor"), when there is one. */
  anchor?: string;
}

const MEASURE_ID = /^(proposition|prop|measure|question|issue|amendment) [a-z0-9]{1,4}$/;

export function raceQueries(contests: TrackedContest[]): RaceQuery[] {
  const people = candidateQueries(contests);
  const out: RaceQuery[] = [];
  for (const c of contests) {
    const stateName = c.state ? STATE_NAMES[c.state] : undefined;
    const where = c.stateLevel ? stateName : placeTerm(c.divisionName) || undefined;
    if (c.kind === "measure") {
      const ids = measureIds(c.title).filter((i) => MEASURE_ID.test(i));
      if (ids.length && where) out.push({ contestId: c.id, state: c.state, tier: contestTier(c), phrases: ids, people: [], context: [where] });
      continue;
    }
    const ps = people.filter((p) => p.contestId === c.id);
    if (!ps.length) continue;
    const office = officeTerms(c.title);
    out.push({
      contestId: c.id,
      state: c.state,
      tier: contestTier(c),
      phrases: ps.map((p) => p.name),
      people: ps.map((p) => ({ candidateId: p.candidateId, surname: p.surname })),
      context: [...new Set([...office, where ?? ""].filter((t) => t.length > 2))],
      anchor: office.find((t) => !/\s/.test(t)),
    });
  }
  return out;
}

const orList = (xs: string[], f: (x: string) => string) => (xs.length === 1 ? f(xs[0]) : `(${xs.map(f).join(" OR ")})`);

/** `("Xavier Becerra" OR "Steve Hilton") (governor OR california) repeat2:"governor" (domainis:… OR …)`. */
export function gdeltRaceQuery(r: RaceQuery, domains: string[]): string {
  const parts = [orList(r.phrases, (p) => `"${p}"`)];
  if (r.context.length) parts.push(orList(r.context, quote));
  if (r.anchor) parts.push(`repeat2:"${r.anchor}"`);
  if (domains.length) parts.push(orList(domains, (d) => `domainis:${d}`));
  return parts.join(" ");
}

/** Candidates in the race whose last name is in the headline. */
export function namedInHeadline(title: string, r: RaceQuery): string[] {
  const t = ` ${normalizeForMatch(title)} `;
  return r.people.filter((p) => t.includes(` ${normalizeForMatch(p.surname)} `)).map((p) => p.candidateId);
}

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

/**
 * Whether the NYT tagged this person. Tags come as "Becerra, Xavier",
 * "Becerra, Xavier (1958- )" or, in newer responses, "Xavier Becerra".
 */
export function nytTagged(persons: string[] | undefined, c: Pick<CandidateQuery, "first" | "surname">): boolean {
  const first = norm(c.first);
  const last = norm(c.surname);
  return (persons ?? []).some((p) => {
    const bare = p.replace(/\([^)]*\)/g, " ");
    if (bare.includes(",")) {
      const [l, f = ""] = bare.split(",");
      return norm(l) === last && norm(f).split(" ").includes(first);
    }
    const words = norm(bare).split(" ");
    return words.includes(first) && words[words.length - 1] === last;
  });
}

/** Opinion and sponsored pieces are held, as the feed checks do for headlines. */
export function isOpinionKind(kind: string | undefined): boolean {
  return /op-?ed|opinion|editorial|letter|column|review|sponsored|advertis/i.test(kind ?? "");
}
