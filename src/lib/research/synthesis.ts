/**
 * Synthesized writing (docs/elections/2026-11-03/WRITING_PIPELINE_PLAN.md):
 * the code checks every sentence must pass, and the payloads they produce.
 *
 * A sentence (a "unit": a prose sentence, a list line, a timeline event, an
 * endorsement) is kept only when
 *   1. each excerpt it cites is really in that document,
 *   2. every number, date and proper name in it is in those excerpts (or
 *      among the item's own names),
 *   3. a verifier says it follows from them (run.ts),
 *   4. it passes the neutrality lint here and the reviewer (run.ts),
 *   5. every candidate in a race gets the same sections (parity: the race
 *      job and the read path).
 * A failing unit gets one repair attempt (run.ts), then it is dropped. Style
 * slips (AP) only ever ask for a repair; nothing is dropped for style.
 * Highlights that break a rule are stripped; the sentence stays. Pure.
 */
import { cleanText, neutralityProblem, normalizeForQuote, quoteFound } from "@/lib/ai/checks";
import {
  CAPS,
  ENDORSEMENT_CATEGORIES,
  MEASURE_FIELDS,
  PERSON_SECTIONS,
  RACE_SECTIONS,
  type MeasureSynthesis,
  type PersonSection,
  type PersonWriting,
  type RaceSection,
  type RaceSynthesis,
  type SynthRef,
} from "@/lib/ai/schemas";
import type { MeasureField, FetchedDoc, StoredSource } from "./verify";
import { BIO_EXTRA, type StoredEducation, type StoredPositionV2 } from "./person";

/* ---------- Stored shapes ---------- */

export interface StoredRef {
  /** sources.id */
  source: string;
  excerpt: string;
}

export interface StoredSentence {
  text: string;
  refs: StoredRef[];
}

/** Race-level fairness pass (owner, 2026-10-30): flagged sentences are rewritten, not cut. */
export interface ParityRewrite {
  /** The candidate's target id (contest_candidates.id). */
  target: string;
  /** The unit in that candidate's payload, e.g. "background.1". */
  unit: string;
  /** textHash of the sentence it replaces: applied only while that sentence is unchanged. */
  fromHash: string;
  text: string;
}

export interface Parity {
  rewrites: ParityRewrite[];
  /** A rewrite that couldn't pass the checks: the sentence is dropped, and listed for review. */
  unresolved: { target: string; unit: string; reason: string }[];
  /** Candidates with no result yet when the pass ran. */
  missing: string[];
  /** Sections a candidate has where another doesn't (thin coverage: reported, never padded). */
  thin: { target: string; sections: string[] }[];
}

export interface RacePayload {
  kind: "race";
  v: 1;
  sections: Partial<Record<RaceSection, StoredSentence[]>>;
  /** Sections the reviewed sources don't support ("Limited documented information…"). */
  limited: string[];
  parity?: Parity;
  sources: Record<string, StoredSource>;
}

export interface MeasureSynthPayload {
  kind: "measure";
  v: 2;
  sections: Partial<Record<MeasureField, StoredSentence[]>>;
  limited: string[];
  sources: Record<string, StoredSource>;
}

export interface PersonPayloadV3 {
  kind: "person";
  v: 3;
  education: StoredEducation[];
  positions: StoredPositionV2[];
  residence?: { place: string; quote: string; source: string };
  sections: Partial<Record<PersonSection, StoredSentence[]>>;
  mightFit: (StoredSentence & { issue: string })[];
  timeline: (StoredSentence & { when: string })[];
  endorsements: { name: string; category: (typeof ENDORSEMENT_CATEGORIES)[number]; refs: StoredRef[] }[];
  limited: string[];
  sources: Record<string, StoredSource>;
}

/** A short, stable hash of a sentence's text (FNV-1a), so a parity rewrite only replaces the sentence it was written for. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ---------- Units ---------- */

export type UnitKind = "prose" | "list" | "mightFit" | "timeline" | "endorsement";

export interface Unit {
  /** "background.1", "mightFit.0", "timeline.3", "endorsements.2" */
  id: string;
  section: string;
  kind: UnitKind;
  text: string;
  refs: SynthRef[];
  issue?: string;
  when?: string;
  category?: string;
}

export type SynthKind = "race" | "measure" | "person";

const LIST_SECTIONS = new Set(["priorities", "stances"]);

function sectionUnits(sections: { section: string; sentences: { text: string; refs: SynthRef[] }[] }[]): Unit[] {
  const seen = new Set<string>();
  const out: Unit[] = [];
  for (const s of sections) {
    if (seen.has(s.section)) continue;
    seen.add(s.section);
    s.sentences.forEach((x, i) => out.push({ id: `${s.section}.${i}`, section: s.section, kind: LIST_SECTIONS.has(s.section) ? "list" : "prose", text: x.text, refs: x.refs }));
  }
  return out;
}

/** Every unit the model wrote, with an id the repair pass and the reviewer refer to. */
export function unitsOf(kind: SynthKind, data: RaceSynthesis | MeasureSynthesis | PersonWriting): Unit[] {
  const out = sectionUnits(data.sections);
  if (kind !== "person") return out;
  const p = data as PersonWriting;
  p.mightFit.forEach((m, i) => out.push({ id: `mightFit.${i}`, section: "mightFit", kind: "mightFit", text: m.text, refs: m.refs, issue: m.issue }));
  p.timeline.forEach((t, i) => out.push({ id: `timeline.${i}`, section: "timeline", kind: "timeline", text: t.event, refs: t.refs, when: t.when }));
  p.endorsements.forEach((e, i) => out.push({ id: `endorsements.${i}`, section: "endorsements", kind: "endorsement", text: e.name, refs: e.refs, category: e.category }));
  return out;
}

/* ---------- Hard facts ---------- */

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};
const MONTHS: Record<string, string> = { jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", sept: "september", oct: "october", nov: "november", dec: "december" };
/** AP title abbreviations, read as the words the sources use. */
const TITLES: Record<string, string> = { gov: "governor", sen: "senator", rep: "representative", lt: "lieutenant", atty: "attorney", gen: "general", supt: "superintendent", assemblymember: "assembly member", councilmember: "council member" };

/**
 * Text as the hard-fact check compares it: normalized, AP abbreviations
 * spelled out, number words as digits ("seven" → 7, "top-two" → "top-2"),
 * and no thousands separators. House style writes numerals; sources often don't.
 */
export function factText(s: string): string {
  let t = normalizeForQuote(s.replace(/<\/?mark>/g, ""));
  t = t.replace(/\b(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?(?=[\s,]|$)/g, (m, k: string) => MONTHS[k]);
  t = t.replace(/\b(gov|sen|rep|lt|atty|gen|supt)(?:\.(?=\s)|$)/g, (m, k: string) => TITLES[k]);
  t = t.replace(/\b(assemblymember|councilmember)\b/g, (m, k: string) => TITLES[k]);
  t = t.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})[- ](${Object.keys(SMALL).filter((k) => SMALL[k] > 0 && SMALL[k] < 10).join("|")})\\b`, "g"), (m, a: string, b: string) => String(TENS[a] + SMALL[b]));
  t = t.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})\\b`, "g"), (m, a: string) => String(TENS[a]));
  t = t.replace(new RegExp(`\\b(${Object.keys(SMALL).join("|")})\\b`, "g"), (m, a: string) => String(SMALL[a]));
  t = t.replace(new RegExp(`\\b(${Object.keys(ORDINALS).join("|")})\\b`, "g"), (m, a: string) => `${ORDINALS[a]}th`);
  t = t.replace(/(\d),(?=\d{3}\b)/g, "$1");
  return t;
}

/** Sentence starters and function words that are capitalized without being names. */
const COMMON = new Set([
  "he", "she", "they", "his", "her", "their", "its", "it", "the", "in", "as", "after", "before", "since", "from", "then", "also", "and", "an", "a",
  "who", "earlier", "later", "previously", "currently", "today", "during", "while", "at", "on", "for", "with", "without", "each", "every", "all",
  "no", "under", "both", "neither", "either", "this", "that", "these", "those", "if", "when", "because", "which", "about", "more", "most",
  "some", "many", "one", "over", "among", "between", "through", "by", "to", "of", "but", "or", "nor", "so", "there", "here", "what", "how",
]);

const wordIn = (w: string, hay: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(hay);

/**
 * Every number, dollar amount, percentage, date and proper name in `text`
 * must appear in its excerpts or among the item's own names. Returns the
 * first one that doesn't, or null.
 */
export function hardFactProblem(text: string, excerpts: string[], ownNames: string[]): string | null {
  const plain = text.replace(/<\/?mark>/g, "");
  const support = factText(`${excerpts.join(" \n ")} \n ${ownNames.join(" \n ")}`);
  const said = factText(plain);
  const nums = new Set(support.match(/\d+(?:\.\d+)?/g) ?? []);
  for (const n of said.match(/\d+(?:\.\d+)?/g) ?? []) if (!nums.has(n)) return `number ${n} not in its sources`;
  for (const m of said.matchAll(/(\d+(?:\.\d+)?)\s*(million|billion|trillion)\b/g)) {
    if (!support.includes(`${m[1]} ${m[2]}`)) return `${m[1]} ${m[2]} not in its sources`;
  }
  // Proper names: capitalized words (sentence starters that are ordinary words excepted).
  const starts = new Set<number>([0]);
  for (const m of plain.matchAll(/[.!?:;]\s+/g)) starts.add(m.index! + m[0].length);
  const supportWords = new Set(support.split(/[^a-z0-9.'-]+/).map((x) => x.replace(/^[.'-]+|[.'-]+$/g, "")).filter((x) => x.length >= 5));
  for (const m of plain.matchAll(/(?<![\p{L}\d])[A-Z][\p{L}'’.-]*/gu)) {
    const abbrev = /^([A-Z]\.)+$/.test(m[0]); // "U.S."
    const raw = abbrev ? m[0] : m[0].replace(/[’']s$/, "").replace(/[.'’-]+$/, "");
    if (raw.length < 2) continue;
    const w = factText(raw);
    if (!w) continue;
    if (starts.has(m.index!) && COMMON.has(w)) continue;
    // A capitalized first word is usually an ordinary word ("Brings…"); it's checked only when it starts a longer name ("Gavin Newsom").
    if (starts.has(m.index!) && !/^\s+[A-Z]/.test(plain.slice(m.index! + m[0].length))) continue;
    if (wordIn(w, support) || wordIn(w.replace(/s$/, ""), support)) continue;
    // The same name in another form: "Democrat" / "Democratic", "Californians" / "California".
    if (w.length >= 6 && [...supportWords].some((sw) => w.startsWith(sw) || sw.startsWith(w.replace(/s$/, "")))) continue;
    return `"${m[0]}" not in its sources`;
  }
  return null;
}

/* ---------- Wording ---------- */

/** In Brief never compares, labels or handicaps (WRITING_PIPELINE_PLAN.md). */
const IN_BRIEF = /\b(outsider|insider|establishment|deepest|r[ée]sum[ée]|electab\w*|momentum|front-?runner|critics?|unlike|rivals?|opponents?|other candidates|than (his|her|their|any|the other|fellow)\b)/i;

const PARTY = /\b(democrat\w*|republican\w*|libertarian\w*|green party|gop|progressives?|conservatives?|liberals?|socialists?|maga)\b/i;
const IDENTITY = /\b(latin[oax]s?|hispanics?|black|white|asians?|women|woman|men|man|christians?|muslims?|jewish|jews|catholics?|gay|lesbians?|lgbtq\w*|transgender|immigrants? like you|as an? (parent|mother|father|immigrant|woman|man))\b/i;
const MIGHT_FIT_START = /^(?:…|\.\.\.)\s*(want|support|oppose|prefer)\b/i;

/** "Might fit if you…" lines: a voter priority matching the candidate's own stated position. */
export function mightFitProblem(text: string): string | null {
  if (!MIGHT_FIT_START.test(text)) return 'must start "…want", "…support", "…oppose" or "…prefer"';
  if (/\b(vote for|should|best)\b/i.test(text)) return "advice or ranking";
  if (PARTY.test(text)) return "party name";
  if (IDENTITY.test(text)) return "identity term";
  return null;
}

/** The repair pass fixes these; a sentence is never dropped for style (AP Stylebook with ballot.ai's exceptions). */
const AP: { re: RegExp; slip: string }[] = [
  { re: /\b(two|three|four|five|six|seven|eight|nine)\b/i, slip: "write numerals (3, not three)" },
  { re: /\bpercent\b/i, slip: 'write "%"' },
  { re: /^\d/, slip: "don't start a sentence with a number" },
  { re: /\b[\p{L}'-]+, (?!(he|she|they|it|the|a|an|his|her|their|which|who|that|and|or)\b)[\p{L}'-]+(?: [\p{L}'-]+){0,2} (and|or) [\p{L}'-]+/iu, slip: "use the Oxford comma" },
  { re: /\b[A-Z][a-z]+, (AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/, slip: "AP state abbreviation after a city (Calif., not CA)" },
  { re: /\b(January|February|August|September|October|November|December) \d{1,2}\b/, slip: "AP date (Nov. 3, not November 3)" },
];

export function apSlips(text: string): string[] {
  const plain = text.replace(/<\/?mark>/g, "");
  // A sentence split into clauses: a slip anywhere counts once.
  return AP.filter((a) => a.re.test(plain)).map((a) => a.slip);
}

/* ---------- Screening one unit ---------- */

export interface ScreenContext {
  /** By the id the model saw ("D1"). */
  docs: Map<string, FetchedDoc>;
  /** The item's own names: candidate, office, jurisdiction, state, the parties as printed on the ballot. */
  ownNames: string[];
  /** A person's verified positions by the model's ids ("P3") → years held, for {{years:P3}}. */
  years?: Map<string, number | null>;
}

export interface Screened {
  unit: Unit;
  /** The text as it will be stored ({{years}} filled, tags other than <mark> stripped). */
  text: string;
  refs: StoredRef[];
  /** Trust failures: repair once, then drop. */
  problems: string[];
  /** Style slips: repair once, never drop. */
  style: string[];
}

/** Code checks for one unit (excerpts, hard facts, wording). The verifier and reviewer run after, in run.ts. */
export function screenUnit(u: Unit, ctx: ScreenContext): Screened {
  const problems: string[] = [];
  let text = cleanText(u.kind === "endorsement" ? u.text.replace(/<\/?mark>/g, "") : u.text, 600);
  if (u.kind === "mightFit" && /^(want|support|oppose|prefer)\b/i.test(text)) text = `…${text}`;

  const refs: StoredRef[] = [];
  const excerpts: string[] = [];
  let unknown = 0;
  for (const r of u.refs.slice(0, 4)) {
    const doc = ctx.docs.get(r.sourceId.trim());
    if (!doc) {
      unknown++;
      continue;
    }
    const excerpt = r.excerpt.trim().slice(0, CAPS.quoteChars);
    if (!quoteFound(excerpt, doc.text) || refs.some((x) => x.source === doc.sourceId && x.excerpt === excerpt)) continue;
    refs.push({ source: doc.sourceId, excerpt });
    excerpts.push(excerpt);
  }
  if (!refs.length) problems.push(unknown ? "cites an unknown document" : "excerpt not found in its document");
  if (!text) problems.push("empty");

  const plain = text.replace(/<\/?mark>/g, "");
  if (refs.length) {
    const facts = `${u.when ? `${u.when}: ` : ""}${plain.replace(/\{\{years:P\d+\}\}/g, " ")}`;
    const hf = hardFactProblem(facts, excerpts, ctx.ownNames);
    if (hf) problems.push(hf);
  }
  const lint = neutralityProblem(plain);
  if (lint) problems.push(`neutrality: ${lint}`);
  if (u.section === "inBrief" && IN_BRIEF.test(plain)) problems.push("In Brief: comparison, label or horse-race term");
  // Profiles leave out family background, awards and momentum words, for everyone (PERSON_RULES).
  if (u.section === "inBrief" || u.section === "background") {
    const extra = BIO_EXTRA.find((b) => b.re.test(plain));
    if (extra) problems.push(`neutrality: ${extra.reason}`);
  }
  if (u.kind === "mightFit") {
    const mf = mightFitProblem(plain);
    if (mf) problems.push(`Might fit: ${mf}`);
  }
  if (u.kind === "endorsement" && !ENDORSEMENT_CATEGORIES.includes(u.category as (typeof ENDORSEMENT_CATEGORIES)[number])) problems.push("unknown endorsement category");

  // Durations are code's: the model names the position, code writes the number.
  text = text.replace(/\{\{years:(P\d+)\}\}/g, (m, id: string) => {
    const n = ctx.years?.get(id);
    if (!n) {
      problems.push(`no verified years for ${id}`);
      return m;
    }
    return n === 1 ? "1 year" : `${n} years`;
  });
  if (/\{\{|\}\}/.test(text)) problems.push("unfilled placeholder");

  const style = u.kind === "endorsement" ? [] : apSlips(plain);
  return { unit: u, text, refs, problems: [...new Set(problems)], style };
}

/** Years each checked position was held, by the ids the writer sees ("P0" = the first checked position), from code-checked start and end years. */
export function yearsHeld(verified: Pick<StoredPositionV2, "startYear" | "endYear">[], now: Date): Map<string, number | null> {
  return new Map(
    verified.map((v, i) => {
      if (!v.startYear || v.endYear === undefined) return [`P${i}`, null];
      const n = (v.endYear === "present" ? now.getUTCFullYear() : v.endYear) - v.startYear;
      return [`P${i}`, n > 0 ? n : null];
    }),
  );
}

/* ---------- Highlights ---------- */

const EVALUATIVE = /\b(historic|landmark|sweeping|major|massive|huge|critical|crucial|key|important|significant|controversial|radical|extreme|bold|failed|successful|popular|unpopular|strong|weak|best|worst|leading)\b/i;

/** Marks that break a rule are stripped (the text stays). */
function stripBadMarks(text: string, measureNames: string[]): string {
  return text.replace(/<mark>([\s\S]*?)<\/mark>/g, (m, inner: string) => {
    if (EVALUATIVE.test(inner) || neutralityProblem(inner)) return inner;
    const n = normalizeForQuote(inner);
    if (measureNames.some((x) => x && (n === normalizeForQuote(x) || n.includes(normalizeForQuote(x))))) return inner;
    return m;
  });
}

const markCount = (t: string) => (t.match(/<mark>/g) ?? []).length;
export const stripMarks = (t: string) => t.replace(/<\/?mark>/g, "");

/** Keep the first `max` highlights across a section's sentences. */
export function capMarks<T extends { text: string }>(list: T[], max: number): T[] {
  let left = max;
  return list.map((s) => ({
    ...s,
    text: s.text.replace(/<mark>([\s\S]*?)<\/mark>/g, (m, inner: string) => (left-- > 0 ? m : inner)),
  }));
}

export function sectionMarks(list: { text: string }[]): number {
  return list.reduce((n, s) => n + markCount(s.text), 0);
}

/* ---------- Shaping a payload ---------- */

/** Most units per section, the same for every item of a kind. */
const SECTION_MAX: Record<string, number> = { inBrief: 3, priorities: 5, stances: 5, mightFit: 4, timeline: 20, endorsements: 16 };
const PROSE_MAX = 4;
const PROSE_MARKS = 3;

export interface ShapeOptions {
  /** A measure's own name and number: never highlighted. */
  measureNames?: string[];
  /** Judges: background and timeline only. */
  judge?: boolean;
}

const expected = (kind: SynthKind, judge = false): string[] =>
  kind === "race"
    ? [...RACE_SECTIONS]
    : kind === "measure"
      ? [...MEASURE_FIELDS]
      : judge
        ? ["background", "timeline"]
        : [...PERSON_SECTIONS, "mightFit", "timeline", "endorsements"];

/** The kept units as stored sections: caps, highlight rules, and which sections are limited. */
export function shapeSections(kind: SynthKind, kept: Screened[], opts: ShapeOptions = {}) {
  const want = expected(kind, opts.judge);
  const by = new Map<string, Screened[]>();
  for (const s of kept) {
    if (!want.includes(s.unit.section)) continue;
    const list = by.get(s.unit.section) ?? [];
    list.push(s);
    by.set(s.unit.section, list);
  }
  const sections: Record<string, StoredSentence[]> = {};
  const mightFit: PersonPayloadV3["mightFit"] = [];
  const timeline: PersonPayloadV3["timeline"] = [];
  const endorsements: PersonPayloadV3["endorsements"] = [];
  for (const name of want) {
    let list = by.get(name) ?? [];
    if (name === "mightFit") {
      const issues = new Set<string>();
      list = list.filter((s) => {
        const k = normalizeForQuote(s.unit.issue ?? s.text);
        if (issues.has(k)) return false;
        issues.add(k);
        return true;
      });
    }
    list = list.slice(0, SECTION_MAX[name] ?? PROSE_MAX);
    const stored = list.map((s) => ({ text: stripBadMarks(s.text, opts.measureNames ?? []), refs: s.refs }));
    if (name === "mightFit") mightFit.push(...list.map((s, i) => ({ text: stripMarks(stored[i].text), refs: s.refs, issue: s.unit.issue ?? "" })));
    else if (name === "timeline") timeline.push(...list.map((s, i) => ({ text: stripMarks(stored[i].text), refs: s.refs, when: cleanText(s.unit.when ?? "", 40) })));
    else if (name === "endorsements") endorsements.push(...list.map((s) => ({ name: s.text, category: s.unit.category as (typeof ENDORSEMENT_CATEGORIES)[number], refs: s.refs })));
    else if (LIST_SECTIONS.has(name)) {
      // A list highlights every item or none, one highlight each.
      const all = stored.length > 0 && stored.every((s) => markCount(s.text) > 0);
      sections[name] = stored.map((s) => ({ ...s, text: all ? capMarks([s], 1)[0].text : stripMarks(s.text) }));
    } else sections[name] = capMarks(stored, PROSE_MARKS);
  }
  const has = (name: string) =>
    name === "mightFit" ? mightFit.length >= SECTION_MAX.mightFit : name === "timeline" ? timeline.length > 0 : name === "endorsements" ? endorsements.length > 0 : (sections[name]?.length ?? 0) > 0;
  const limited = want.filter((n) => !has(n));
  for (const n of Object.keys(sections)) if (!sections[n].length) delete sections[n];
  return { sections, mightFit, timeline, endorsements, limited };
}

/** The units of a stored person payload, by id, for the race-level fairness pass and the read path. */
export function personUnits(p: PersonPayloadV3): { id: string; section: string; text: string; refs: StoredRef[] }[] {
  const out: { id: string; section: string; text: string; refs: StoredRef[] }[] = [];
  for (const [section, list] of Object.entries(p.sections)) list?.forEach((s, i) => out.push({ id: `${section}.${i}`, section, text: s.text, refs: s.refs }));
  p.mightFit.forEach((s, i) => out.push({ id: `mightFit.${i}`, section: "mightFit", text: s.text, refs: s.refs }));
  p.timeline.forEach((s, i) => out.push({ id: `timeline.${i}`, section: "timeline", text: `${s.when}: ${s.text}`, refs: s.refs }));
  return out;
}

/** Applies race-level rewrites (only where the sentence is still the one reviewed) and drops unresolved ones. Pure. */
export function applyParity(p: PersonPayloadV3, target: string, parity: Parity | undefined): PersonPayloadV3 {
  if (!parity) return p;
  const rewrites = parity.rewrites.filter((r) => r.target === target);
  const dropped = new Set(parity.unresolved.filter((u) => u.target === target).map((u) => u.unit));
  if (!rewrites.length && !dropped.size) return p;
  const fix = <T extends { text: string }>(id: string, s: T): T | null => {
    if (dropped.has(id)) return null;
    const r = rewrites.find((x) => x.unit === id && x.fromHash === textHash(s.text));
    return r ? { ...s, text: r.text } : s;
  };
  const sections: PersonPayloadV3["sections"] = {};
  for (const [name, list] of Object.entries(p.sections) as [PersonSection, StoredSentence[]][]) {
    sections[name] = list.map((s, i) => fix(`${name}.${i}`, s)).filter((s): s is StoredSentence => !!s);
  }
  return {
    ...p,
    sections,
    mightFit: p.mightFit.map((s, i) => fix(`mightFit.${i}`, s)).filter((s): s is PersonPayloadV3["mightFit"][number] => !!s),
    timeline: p.timeline.map((s, i) => fix(`timeline.${i}`, s)).filter((s): s is PersonPayloadV3["timeline"][number] => !!s),
  };
}

/**
 * Every candidate in a race gets the same number of highlights per section,
 * within 1 (WRITING_PIPELINE_PLAN.md): marks beyond the fewest + 1 are stripped. Pure.
 */
export function trimMarksToParity(list: PersonPayloadV3[]): PersonPayloadV3[] {
  if (list.length < 2) return list;
  const names = [...new Set(list.flatMap((p) => Object.keys(p.sections)))] as PersonSection[];
  const out = list.map((p) => ({ ...p, sections: { ...p.sections } }));
  for (const name of names) {
    const counts = out.map((p) => (p.sections[name]?.length ? sectionMarks(p.sections[name]!) : null)).filter((n): n is number => n !== null);
    if (counts.length < 2) continue;
    const max = Math.min(...counts) + 1;
    for (const p of out) if (p.sections[name]?.length) p.sections[name] = capMarks(p.sections[name]!, max);
  }
  return out;
}
