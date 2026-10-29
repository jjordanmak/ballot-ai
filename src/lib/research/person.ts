/**
 * People, in two stages (owner, 2026-10-29). Stage 1: the model returns
 * facts as fields; code checks every name and year against the quote, drops
 * what fails, resolves conflicts by source trust, and formats every line
 * (src/domain/profileFormat.ts). Stage 2: the model writes a short neutral
 * bio from those facts only; code checks every name and number in it traces
 * back to a fact it cites. Pure functions.
 */
import { cleanText, neutralityProblem, normalizeForQuote, quoteFound } from "@/lib/ai/checks";
import { CAPS, type EducationFact, type PersonBio, type PersonFacts, type PositionFact } from "@/lib/ai/schemas";
import { educationLine, positionLine, sortPositions, type PositionEntry } from "@/domain/profileFormat";
import type { FetchedDoc, Pending, Rejection, SourceTier, StoredSource } from "./verify";

/** Trust order when two sources disagree (owner, 2026-10-29). */
export const TIER_RANK: Record<SourceTier, number> = { official: 0, ballotpedia: 1, news: 2, campaign: 3 };

export interface StoredFactRef {
  quote: string;
  source: string;
}

export interface StoredEducation extends StoredFactRef {
  degree: string;
  field?: string;
  institution: string;
  year?: number;
}

export interface StoredPositionV2 extends StoredFactRef, PositionEntry {
  type: PositionFact["type"];
}

export interface StoredBioSentence {
  text: string;
  /** Fact ids: "E0", "P3", "L0" (platform), "R" (residence). */
  facts: string[];
}

export interface PersonPayloadV2 {
  kind: "person";
  v: 2;
  education: StoredEducation[];
  positions: StoredPositionV2[];
  platform: { text: string; quote: string; source: string }[];
  residence?: { place: string; quote: string; source: string };
  bio: StoredBioSentence[];
  sources: Record<string, StoredSource>;
}

export interface Conflict {
  fact: string;
  kept: string;
  dropped: string;
}

const STOP = new Set(["the", "and", "for", "of", "in", "on", "at", "to", "a", "an", "with", "from", "by", "s"]);

/** Significant words of a phrase. */
const words = (s: string) =>
  normalizeForQuote(s)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

/** Most of the phrase's words appear in the quote. Word order and endings may differ ("represented" / "Representative"). */
export function mentions(quote: string, phrase: string, ratio = 0.75): boolean {
  const qw = normalizeForQuote(quote).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/);
  const w = words(phrase);
  if (!w.length) return true;
  const hit = (x: string) => {
    const stem = x.slice(0, Math.max(4, Math.min(x.length, 6)));
    return qw.some((q) => q === x || (x.length >= 4 && q.length >= 4 && q.startsWith(stem)));
  };
  return w.filter(hit).length / w.length >= ratio;
}

/** Role words a quote often implies rather than states ("served in the State Assembly" → Member). */
const GENERIC_TITLE = /^(state |u\.?s\.? )?(member|representative|assembly ?member|council ?member|senator|trustee|delegate|board member|director|commissioner)(,.*)?$/i;

const DEGREE_WORDS: [RegExp, RegExp][] = [
  [/^j\.?d\.?$|juris doctor/i, /juris doctor|\bj\.?\s?d\b|law degree|law school/i],
  [/^b\.?a\.?$|bachelor of arts/i, /bachelor|\bb\.?\s?a\b|undergraduate degree/i],
  [/^b\.?s\.?$|bachelor of science/i, /bachelor|\bb\.?\s?s\b/i],
  [/^m\.?b\.?a\.?$|business administration/i, /\bm\.?\s?b\.?\s?a\b|business administration/i],
  [/^ph\.?d\.?$|doctor of philosophy|doctorate/i, /ph\.?\s?d|doctorate|doctor of philosophy/i],
  [/^m\.?d\.?$|doctor of medicine/i, /\bm\.?\s?d\b|medical degree|doctor of medicine/i],
];

function degreeInQuote(degree: string, quote: string): boolean {
  for (const [isThis, evidence] of DEGREE_WORDS) if (isThis.test(degree.trim())) return evidence.test(quote);
  return mentions(quote, degree, 0.5);
}

const yearIn = (quote: string, y: number) => new RegExp(`\\b${y}\\b`).test(quote);
const CURRENT = /\b(currently|since|now|serves|serving|incumbent|is the|is a|was elected in|re-?elected)\b/i;

/** The latest plausible year a document mentions (a 2017 press release can't say who holds an office today). */
export function latestYear(text: string, now: Date): number {
  let max = 0;
  const cap = now.getUTCFullYear();
  for (const m of text.matchAll(/\b(19[5-9]\d|20\d\d)\b/g)) {
    const y = Number(m[1]);
    if (y <= cap && y > max) max = y;
  }
  return max;
}

function citeDoc(field: string, a: { quote: string; sourceId: string }, docs: Map<string, FetchedDoc>, rejected: Rejection[]): { doc: FetchedDoc; quote: string } | null {
  const doc = docs.get(a.sourceId);
  if (!doc) {
    rejected.push({ field, reason: "unknown source" });
    return null;
  }
  const quote = a.quote.trim().slice(0, CAPS.quoteChars);
  if (!quoteFound(quote, doc.text)) {
    rejected.push({ field, reason: "quote not found" });
    return null;
  }
  return { doc, quote };
}

export interface ScreenedFacts {
  education: (StoredEducation & { tier: SourceTier })[];
  positions: (StoredPositionV2 & { tier: SourceTier })[];
  /** Platform items still need the AI support check (they're prose). */
  platform: Pending[];
  residence?: { place: string; quote: string; source: string };
  rejected: Rejection[];
  conflicts: Conflict[];
}

const clean = (s: string | null | undefined, max = 160) => (s ? cleanText(s, max).replace(/<\/?mark>/g, "") : undefined);

/** Stage 1 checks: every field must be stated by its own quote. */
export function screenFacts(data: PersonFacts, docList: FetchedDoc[], opts: { local: boolean; judge: boolean; now: Date }): ScreenedFacts {
  const docs = new Map(docList.map((d) => [d.id, d]));
  const rejected: Rejection[] = [];
  const conflicts: Conflict[] = [];
  const nowYear = opts.now.getUTCFullYear();

  const education: ScreenedFacts["education"] = [];
  data.education.slice(0, CAPS.education).forEach((e: EducationFact, i) => {
    const field = `education.${i}`;
    const c = citeDoc(field, e, docs, rejected);
    if (!c) return;
    const why = !mentions(c.quote, e.institution)
      ? "institution not in quote"
      : !degreeInQuote(e.degree, c.quote)
        ? "degree not in quote"
        : e.field && !mentions(c.quote, e.field, 0.5)
          ? "field not in quote"
          : e.year && !yearIn(c.quote, e.year)
            ? "year not in quote"
            : null;
    if (why) return void rejected.push({ field, reason: "unsupported", detail: why });
    education.push({ degree: clean(e.degree)!, field: clean(e.field), institution: clean(e.institution)!, year: e.year ?? undefined, quote: c.quote, source: c.doc.sourceId, tier: c.doc.meta.tier ?? "campaign" });
  });

  const positions: ScreenedFacts["positions"] = [];
  data.positions.slice(0, CAPS.positions).forEach((p: PositionFact, i) => {
    const field = `positions.${i}`;
    const c = citeDoc(field, p, docs, rejected);
    if (!c) return;
    const end = p.endYear?.trim().toLowerCase();
    const endYear = end === "present" ? "present" : end && /^\d{4}$/.test(end) ? Number(end) : undefined;
    const titleOk = mentions(c.quote, p.title, 0.6) || (GENERIC_TITLE.test(p.title.trim()) && !!p.organization && mentions(c.quote, p.organization, 0.75));
    const why = !titleOk
      ? "title not in quote"
      : p.organization && !mentions(c.quote, p.organization, 0.6)
        ? "organization not in quote"
        : p.startYear && !yearIn(c.quote, p.startYear)
          ? "start year not in quote"
          : typeof endYear === "number" && !yearIn(c.quote, endYear)
            ? "end year not in quote"
            : endYear === "present" && !CURRENT.test(c.quote) && !p.startYear
              ? "'present' not stated"
              : null;
    if (why) return void rejected.push({ field, reason: "unsupported", detail: why });
    // "Present" from an old document (an archived page, or one whose latest date is years back) can't be trusted:
    // keep the start, drop the end. Campaign and bio pages often carry no recent date, so the window is wide.
    const stale = endYear === "present" && (/\barchive/i.test(c.doc.meta.url) || latestYear(c.doc.text, opts.now) < nowYear - 10);
    positions.push({
      title: clean(p.title)!,
      organization: clean(p.organization),
      district: clean(p.district, 80),
      startYear: p.startYear ?? undefined,
      endYear: stale ? undefined : endYear,
      type: p.type,
      committees: p.committees.map((x) => clean(x, 120)!).filter((x) => x && mentions(c.quote, x, 0.6)),
      quote: c.quote,
      source: c.doc.sourceId,
      tier: c.doc.meta.tier ?? "campaign",
    });
  });

  // Same office from two sources: keep the more trusted one, and note any disagreement.
  const merged = new Map<string, ScreenedFacts["positions"][number]>();
  for (const p of positions) {
    const k = `${normalizeForQuote(p.title)}|${normalizeForQuote(p.organization ?? "")}`;
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, p);
      continue;
    }
    const [keep, drop] = TIER_RANK[p.tier] < TIER_RANK[prev.tier] ? [p, prev] : [prev, p];
    if (positionLine(keep) !== positionLine(drop)) conflicts.push({ fact: keep.title, kept: positionLine(keep), dropped: positionLine(drop) });
    keep.committees = [...new Set([...(keep.committees ?? []), ...(drop.committees ?? [])])];
    merged.set(k, keep);
  }
  const eduMerged = new Map<string, ScreenedFacts["education"][number]>();
  for (const e of education) {
    const k = `${educationLine({ ...e, year: undefined })}`.toLowerCase();
    const prev = eduMerged.get(k);
    if (!prev || TIER_RANK[e.tier] < TIER_RANK[prev.tier]) eduMerged.set(k, prev && !e.year ? { ...e, year: prev.year } : e);
  }

  const platform: Pending[] = [];
  if (!opts.judge) {
    data.platform.slice(0, CAPS.platform).forEach((a, i) => {
      const field = `platform.${i}`;
      const c = citeDoc(field, a, docs, rejected);
      if (!c) return;
      // The candidate's own words only: their statement, campaign site, or Ballotpedia's campaign themes.
      if (c.doc.meta.tier === "news") return void rejected.push({ field, reason: "unsupported", detail: "platform from news" });
      const text = cleanText(a.text, CAPS.textChars);
      const problem = neutralityProblem(text.replace(/<\/?mark>/g, ""));
      if (problem) return void rejected.push({ field, reason: "neutrality", detail: problem });
      platform.push({ field, text, quote: c.quote, source: c.doc.sourceId });
    });
  }

  let residence: ScreenedFacts["residence"];
  if (opts.local && data.residence) {
    const c = citeDoc("residence", data.residence, docs, rejected);
    if (c && mentions(c.quote, data.residence.place, 1) && !/\d/.test(data.residence.place)) {
      residence = { place: clean(data.residence.place, 80)!, quote: c.quote, source: c.doc.sourceId };
    } else if (c) rejected.push({ field: "residence", reason: "unsupported", detail: "place not in quote" });
  }

  return { education: [...eduMerged.values()], positions: sortPositions([...merged.values()]), platform, residence, rejected, conflicts };
}

/** The facts as the bio writer sees them: id + the line ballot.ai shows. */
export function factList(f: { education: StoredEducation[]; positions: StoredPositionV2[]; platform: { text: string }[]; residence?: { place: string } }): { id: string; line: string }[] {
  return [
    ...f.positions.map((p, i) => ({ id: `P${i}`, line: [positionLine(p), p.committees?.length ? `committees: ${p.committees.join(", ")}` : ""].filter(Boolean).join("; ") })),
    ...f.education.map((e, i) => ({ id: `E${i}`, line: educationLine(e) })),
    ...(f.residence ? [{ id: "R", line: `Lives in ${f.residence.place}` }] : []),
  ];
}

const BIO_EXTRA: { re: RegExp; reason: string }[] = [
  { re: /\b(son|daughter|child|grandson|granddaughter) of\b|\bfirst in (his|her|their) family\b|\bimmigrant parents\b|\bworking-class\b/i, reason: "family background" },
  { re: /\b(award|awarded|honored|honoured|recognized as|named one of)\b/i, reason: "awards" },
  { re: /\b(surged|struggled|slumped|soared|plummeted|rising star|popular|beloved|embattled|scandal)\b/i, reason: "judgment" },
];

const COMMON = new Set(["he", "she", "they", "his", "her", "their", "the", "in", "as", "after", "before", "since", "from", "then", "also", "and", "an", "a", "who", "earlier", "later", "previously", "currently", "today", "during", "while", "at", "on", "for", "with"]);

/**
 * Stage 2 check: every number and capitalized name in a sentence must appear
 * in the facts it cites (or the person's name); wording passes the lint.
 */
export function checkBio(bio: PersonBio, facts: { id: string; line: string }[], personName: string): { kept: StoredBioSentence[]; rejected: Rejection[] } {
  const byId = new Map(facts.map((f) => [f.id, f.line]));
  const kept: StoredBioSentence[] = [];
  const rejected: Rejection[] = [];
  bio.sentences.slice(0, CAPS.bioSentences).forEach((s, i) => {
    const field = `bio.${i}`;
    const text = cleanText(s.text, 400).replace(/<\/?mark>/g, "");
    const ids = [...new Set(s.facts)].filter((id) => byId.has(id));
    if (!ids.length) return void rejected.push({ field, reason: "unsupported", detail: "cites no known fact" });
    const support = normalizeForQuote(`${ids.map((id) => byId.get(id)).join(" ")} ${personName}`);
    for (const n of text.match(/\d{2,}/g) ?? []) {
      if (!support.includes(n)) return void rejected.push({ field, reason: "unsupported", detail: `number ${n} not in cited facts` });
    }
    const names = (text.match(/\b[A-Z][A-Za-z.'-]{2,}\b/g) ?? []).filter((w) => !COMMON.has(w.toLowerCase()));
    for (const w of names) {
      if (!support.includes(normalizeForQuote(w).replace(/\.$/, ""))) return void rejected.push({ field, reason: "unsupported", detail: `"${w}" not in cited facts` });
    }
    const problem = neutralityProblem(text) ?? BIO_EXTRA.find((b) => b.re.test(text))?.reason ?? null;
    if (problem) return void rejected.push({ field, reason: "neutrality", detail: problem });
    kept.push({ text, facts: ids });
  });
  return { kept, rejected };
}

/** The sources a set of kept facts cite, for the payload. */
export function usedSources(docs: FetchedDoc[], ids: Iterable<string>): Record<string, StoredSource> {
  const used = new Set(ids);
  return Object.fromEntries(docs.filter((d) => used.has(d.sourceId)).map((d) => [d.sourceId, d.meta]));
}
