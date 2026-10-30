/**
 * Decides which tracked contests and candidates an article is about.
 *
 * The context rules are about identity, not topic (owner, 2026-10-30: any
 * news about a candidate's personal or political life counts). A trusted
 * outlet can still write about a different "Jane Kim" or another county's
 * "Measure M", so a candidate needs their name plus context (office, place,
 * election words, or an opponent) anywhere in the article; short,
 * collision-prone names need two pieces of context. A measure needs its
 * identifier plus its jurisdiction.
 *
 * Given the article's own text, a name that appears only there needs
 * stronger context (office, opponent, place or state, not just "vote"), and
 * the person or measure must be named at least twice: a passing mention in a
 * long story is rarely about them. Pure and unit-tested.
 */
import { splitMapYear } from "@/domain/districtMaps";
import { normalizeForMatch } from "@/domain/text";

export interface TrackedCandidate {
  id: string;
  /** Readable and ballot names; variants are derived here. */
  names: string[];
}

export interface TrackedContest {
  id: string;
  kind: "candidate" | "measure";
  title: string;
  divisionName: string;
  /** USPS code, e.g. "CA". */
  state?: string;
  /** Statewide, federal, legislative or appellate: a state outlet's own state counts as context for it. */
  stateLevel?: boolean;
  candidates: TrackedCandidate[];
}

/** Whether a division is state-level (statewide, congressional, legislative, appellate) rather than local. */
export function isStateLevelDivision(key: string, scope: string | null | undefined, name: string | null | undefined): boolean {
  if (/^ocd-division\/country:us(\/(state:[a-z]{2}|district:dc))?(\/(cd|sldl|sldu):[^/]+)?$/.test(key)) return true;
  if (/^(statewide|congressional|stateupper|statelower|national)$/i.test(scope ?? "")) return true;
  if (/^[a-z]{2}:court:/.test(key)) return true;
  return /\b(congressional|assembly|state senate|senate district|house district|legislative) district\b|\bcongressional district\b/i.test(name ?? "");
}

export interface SourceContext {
  /** National outlets match every tracked contest; state and local outlets only their own state's. */
  scope: "national" | "state" | "local";
  /** USPS code; required for state and local outlets. Its name counts as implied context. */
  state?: string;
  /** Places a local outlet covers; count as context the article may not repeat. */
  jurisdictions?: string[];
}

export interface MatchResult {
  contestIds: string[];
  candidateIds: string[];
  terms: string[];
  /** "article" when the article's text was given (the collector tries the headline and summary first). */
  via: "headline" | "article";
}

/** Article text past this is ignored (long pages are mostly related-story lists by then). */
export const MAX_ARTICLE_CHARS = 60_000;

const ELECTION_TERMS = ["candidate", "campaign", "election", "race", "ballot", "elected", "reelection", "re election", "incumbent", "challenger", "vote", "voters", "debate", "endorse", "endorsed", "endorsement"];

/** Office words in a contest title → words an article might use instead. */
const OFFICE_SYNONYMS: [RegExp, string[]][] = [
  [/lieutenant governor/, ["lieutenant governor", "lt governor"]],
  [/(?<!lieutenant )governor/, ["governor", "gubernatorial"]],
  [/secretary of state/, ["secretary of state"]],
  [/controller/, ["controller"]],
  [/treasurer/, ["treasurer"]],
  [/attorney general/, ["attorney general"]],
  [/insurance commissioner/, ["insurance commissioner"]],
  [/superintendent/, ["superintendent", "schools chief"]],
  [/board of equalization/, ["board of equalization"]],
  [/representative|congress/, ["congress", "congressional", "house", "representative", "congressman", "congresswoman"]],
  [/assembly/, ["assembly", "assemblymember", "assemblyman", "assemblywoman"]],
  [/senat/, ["senate", "senator"]],
  [/supervisor/, ["supervisor", "supervisors"]],
  [/council/, ["council", "councilmember", "city council"]],
  [/mayor/, ["mayor"]],
  [/board of education|school|college|trustee/, ["trustee", "board of education", "school board", "college board"]],
  [/justice|court/, ["justice", "court", "retention", "supreme court", "court of appeal"]],
];

export const STATE_NAMES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado",
  CT: "connecticut", DE: "delaware", DC: "district of columbia", FL: "florida", GA: "georgia", HI: "hawaii",
  ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky",
  LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota",
  MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west virginia", WI: "wisconsin", WY: "wyoming",
};
const GENERIC_PLACE_WORDS = /\b(county|of|city|town|district|unified|high school|elementary|school|community college|college|trustee area \w+|\d+(st|nd|rd|th)|congressional|assembly|supervisorial|\d{4}|the)\b/g;
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

const has = (hay: string, needle: string) => needle.length > 0 && hay.includes(` ${needle} `);

/** "Donald P. (Don) Wagner" → donald p don wagner, donald p wagner, donald wagner, don wagner. */
export function nameVariants(name: string): string[] {
  const nick = /\(([^)]+)\)/.exec(name)?.[1];
  const base = normalizeForMatch(name.replace(/\([^)]*\)/g, " "));
  const toks = base.split(" ").filter(Boolean);
  // A one-word name is too common to match on its own.
  if (toks.length < 2) return [];
  let lastIdx = toks.length - 1;
  if (SUFFIXES.has(toks[lastIdx]) && lastIdx > 1) lastIdx--;
  const first = toks[0];
  const last = toks[lastIdx];
  const out = new Set([normalizeForMatch(name), base, `${first} ${last}`, toks.filter((t) => t.length > 1).join(" ")]);
  if (nick) out.add(`${normalizeForMatch(nick)} ${last}`);
  return [...out].filter((v) => v.split(" ").length >= 2);
}

/** "County of San Mateo" → "san mateo"; "Jefferson Union High School District" → "jefferson union". */
export function placeTerm(divisionName: string): string {
  return normalizeForMatch(splitMapYear(divisionName).name).replace(GENERIC_PLACE_WORDS, " ").replace(/\s+/g, " ").trim();
}

export function officeTerms(title: string): string[] {
  const t = normalizeForMatch(title);
  return OFFICE_SYNONYMS.flatMap(([re, terms]) => (re.test(t) ? terms : []));
}

/** Measure identifiers an article might use: "proposition 1" → also "prop 1". */
export function measureIds(title: string): string[] {
  const t = normalizeForMatch(title);
  const prop = /^proposition (\d+)$/.exec(t);
  if (prop) return [`proposition ${prop[1]}`, `prop ${prop[1]}`];
  return [t];
}

interface CompiledCandidate {
  id: string;
  contestId: string;
  state?: string;
  stateLevel: boolean;
  /** Local contests: the article must name the place or an opponent (many people share a name). */
  anchors: string[];
  variants: string[];
  context: string[];
  /** Context that identifies the race (office, opponents, place, state), unlike bare election words. */
  strong: string[];
  /** Last name, for counting how often a story names them. */
  surname: string;
  needed: number;
}

interface CompiledMeasure {
  contestId: string;
  state?: string;
  ids: string[];
  places: string[];
}

export function buildMatcher(contests: TrackedContest[]) {
  const candidates: CompiledCandidate[] = [];
  const measures: CompiledMeasure[] = [];
  // Names shared by more than one tracked person always need extra context.
  const nameCount = new Map<string, number>();
  for (const c of contests) for (const k of c.candidates) for (const v of new Set(k.names.flatMap(nameVariants))) nameCount.set(v, (nameCount.get(v) ?? 0) + 1);

  for (const c of contests) {
    const place = placeTerm(c.divisionName);
    const stateName = c.state ? STATE_NAMES[c.state] : undefined;
    if (c.kind === "measure") {
      // A local measure needs its own place; only a statewide one is satisfied by the state's name.
      const places = c.stateLevel ? [stateName ?? place] : [place];
      measures.push({ contestId: c.id, state: c.state, ids: measureIds(c.title), places: places.filter((x): x is string => !!x) });
      continue;
    }
    for (const k of c.candidates) {
      const variants = [...new Set(k.names.flatMap(nameVariants))];
      const opponents = c.candidates
        .filter((o) => o.id !== k.id)
        .flatMap((o) => o.names.map((n) => normalizeForMatch(n.replace(/\([^)]*\)/g, " ")).split(" ").filter(Boolean).pop() ?? ""))
        .filter((n) => n.length > 2);
      const shortest = Math.min(...variants.map((v) => v.length));
      const shared = variants.some((v) => (nameCount.get(v) ?? 0) > 1);
      candidates.push({
        id: k.id,
        contestId: c.id,
        state: c.state,
        stateLevel: !!c.stateLevel,
        anchors: c.stateLevel ? [] : [place, ...opponents].filter(Boolean),
        variants,
        context: [...new Set([...officeTerms(c.title), place, stateName ?? "", ...ELECTION_TERMS, ...opponents].filter(Boolean))],
        strong: [...new Set([...officeTerms(c.title), place, stateName ?? "", ...opponents].filter(Boolean))],
        surname: variants[0]?.split(" ").filter((t) => !SUFFIXES.has(t)).pop() ?? "",
        needed: shared || shortest <= 9 ? 2 : 1,
      });
    }
  }

  /**
   * `article` is the story's own text (from the feed or the page), when the
   * headline and summary alone don't match.
   */
  return function match(title: string, summary: string, source: SourceContext, article?: string): MatchResult | null {
    const head = ` ${normalizeForMatch(`${title} ${summary}`)} `;
    const text = article ? ` ${normalizeForMatch(`${title} ${summary} ${article.slice(0, MAX_ARTICLE_CHARS)}`)} ` : head;
    const national = source.scope === "national";
    // A state or local outlet's "Smith" is about that state's Smith, never another state's.
    const inScope = (state?: string) => national || (!!source.state && state === source.state);
    const implied = [
      ...(!national && source.state && STATE_NAMES[source.state] ? [STATE_NAMES[source.state]] : []),
      ...(source.jurisdictions ?? []).map((j) => normalizeForMatch(j)),
    ];
    const impliedState = !national && source.state ? STATE_NAMES[source.state] : undefined;
    const inContext = (term: string) => has(text, term) || implied.includes(term);
    const contestIds = new Set<string>();
    const candidateIds = new Set<string>();
    const terms = new Set<string>();

    for (const k of candidates) {
      if (!inScope(k.state)) continue;
      const inHead = k.variants.find((v) => has(head, v));
      const name = inHead ?? (article ? k.variants.find((v) => has(text, v)) : undefined);
      if (!name) continue;
      // The outlet's own state is implied context only for state-level contests,
      // and implied context never stands alone: the article must say something.
      const explicit = k.context.filter((t) => has(text, t));
      if (!explicit.length) continue;
      const ctx = k.context.filter((t) => has(text, t) || (implied.includes(t) && (t !== impliedState || k.stateLevel)));
      if (ctx.length < k.needed) continue;
      if (k.anchors.length && !k.anchors.some((a) => ctx.includes(a))) continue;
      // Named only in the story: election words alone don't say which person this is,
      // and a story about someone names them more than once (a passing mention doesn't count).
      if (!inHead && (k.strong.filter((t) => has(text, t)).length < k.needed || count(text, k.surname) < 2)) continue;
      candidateIds.add(k.id);
      contestIds.add(k.contestId);
      terms.add(name);
      ctx.slice(0, 3).forEach((t) => terms.add(t));
    }
    for (const m of measures) {
      if (!inScope(m.state)) continue;
      const inHead = m.ids.find((i) => has(head, i));
      const id = inHead ?? (article ? m.ids.find((i) => count(text, i) >= 2) : undefined);
      if (!id) continue;
      const place = m.places.find(inContext);
      if (!place) continue;
      contestIds.add(m.contestId);
      terms.add(id);
      terms.add(place);
    }
    return contestIds.size ? { contestIds: [...contestIds], candidateIds: [...candidateIds], terms: [...terms], via: article ? "article" : "headline" } : null;
  };
}

function count(hay: string, needle: string): number {
  let n = 0;
  for (let at = hay.indexOf(` ${needle} `); at >= 0; at = hay.indexOf(` ${needle} `, at + needle.length + 1)) n++;
  return n;
}

/**
 * How promising an unmatched headline is, for choosing which articles to
 * read first: 2 for a tracked surname or measure, 1 for an office or
 * election word, else 0. Ordering only; it never decides a match.
 */
export function buildHint(contests: TrackedContest[]): (title: string, summary: string) => number {
  const strong = new Set<string>();
  const weak = new Set<string>(ELECTION_TERMS);
  for (const c of contests) {
    officeTerms(c.title).forEach((t) => weak.add(t));
    if (c.kind === "measure") measureIds(c.title).forEach((i) => strong.add(i));
    for (const k of c.candidates) for (const v of k.names.flatMap(nameVariants)) strong.add(v.split(" ").pop()!);
  }
  const strongList = [...strong].filter((t) => t.length > 2);
  const weakList = [...weak];
  return (title, summary) => {
    const text = ` ${normalizeForMatch(`${title} ${summary}`)} `;
    if (strongList.some((t) => has(text, t))) return 2;
    return weakList.some((t) => has(text, t)) ? 1 : 0;
  };
}

/** One tracked candidate, with the words that identify their race, for news APIs queried by name. */
export interface CandidateQuery {
  candidateId: string;
  contestId: string;
  state?: string;
  stateLevel: boolean;
  /** Full name as people write it ("Xavier Becerra"), and its parts. */
  name: string;
  first: string;
  surname: string;
  /** Office words, the place or state, and opponents' last names: one must appear in a story about them. */
  context: string[];
  /** 0 statewide, 1 other state-level (federal, legislative, appellate), 2 local: who is asked about first. */
  tier: 0 | 1 | 2;
  /** Judges' retention races, which national outlets rarely cover. */
  judicial: boolean;
}

/** 0 statewide, 1 other state-level, 2 local. */
export function contestTier(c: Pick<TrackedContest, "divisionName" | "state" | "stateLevel">): 0 | 1 | 2 {
  if (c.state && normalizeForMatch(c.divisionName) === STATE_NAMES[c.state]) return 0;
  return c.stateLevel ? 1 : 2;
}

/** Readable "First Last" from a ballot name ("DONALD P. (DON) WAGNER" → "Don Wagner"). */
function queryName(names: string[]): { name: string; first: string; surname: string } | null {
  const raw = names.find((n) => /\p{Ll}/u.test(n)) ?? names[0] ?? "";
  const nick = /\(([^)]+)\)/.exec(raw)?.[1];
  const toks = raw.replace(/\([^)]*\)/g, " ").replace(/[,]/g, " ").split(/\s+/).filter(Boolean);
  const words = toks.filter((t) => !/^[A-Za-z]\.?$/.test(t) && !SUFFIXES.has(t.toLowerCase().replace(/\./g, "")));
  if (words.length < 2) return null;
  const title = (w: string) => (/\p{Ll}/u.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase());
  const first = title(nick ?? words[0]);
  const surname = title(words[words.length - 1]);
  return { name: `${first} ${surname}`, first, surname };
}

export function candidateQueries(contests: TrackedContest[]): CandidateQuery[] {
  const out: CandidateQuery[] = [];
  for (const c of contests) {
    if (c.kind !== "candidate") continue;
    const stateName = c.state ? STATE_NAMES[c.state] : undefined;
    const place = placeTerm(c.divisionName);
    for (const k of c.candidates) {
      const n = queryName(k.names);
      if (!n) continue;
      const opponents = c.candidates
        .filter((o) => o.id !== k.id)
        .map((o) => queryName(o.names)?.surname)
        .filter((s): s is string => !!s && s.length > 2);
      out.push({
        candidateId: k.id,
        contestId: c.id,
        state: c.state,
        stateLevel: !!c.stateLevel,
        ...n,
        context: [...new Set([...officeTerms(c.title), place, stateName ?? "", ...opponents.map((o) => o.toLowerCase())].filter((t) => t && t.length > 2))],
        tier: contestTier(c),
        judicial: /\b(justice|judge|court)\b/i.test(c.title),
      });
    }
  }
  return out;
}
