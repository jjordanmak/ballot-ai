/**
 * Decides which tracked contests and candidates an article is about.
 *
 * Deliberately strict: a trusted outlet can still write about a different
 * "Jane Kim" or another county's "Measure M". A candidate needs their name
 * plus context (office, place, election words, or an opponent); short,
 * collision-prone names need two pieces of context. A measure needs its
 * identifier plus its jurisdiction. Pure and unit-tested.
 */
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
}

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
  return normalizeForMatch(divisionName).replace(GENERIC_PLACE_WORDS, " ").replace(/\s+/g, " ").trim();
}

function officeTerms(title: string): string[] {
  const t = normalizeForMatch(title);
  return OFFICE_SYNONYMS.flatMap(([re, terms]) => (re.test(t) ? terms : []));
}

/** Measure identifiers an article might use: "proposition 1" → also "prop 1". */
function measureIds(title: string): string[] {
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
        needed: shared || shortest <= 9 ? 2 : 1,
      });
    }
  }

  return function match(title: string, summary: string, source: SourceContext): MatchResult | null {
    const text = ` ${normalizeForMatch(`${title} ${summary}`)} `;
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
      const name = k.variants.find((v) => has(text, v));
      if (!name) continue;
      // The outlet's own state is implied context only for state-level contests,
      // and implied context never stands alone: the article must say something.
      const explicit = k.context.filter((t) => has(text, t));
      if (!explicit.length) continue;
      const ctx = k.context.filter((t) => has(text, t) || (implied.includes(t) && (t !== impliedState || k.stateLevel)));
      if (ctx.length < k.needed) continue;
      if (k.anchors.length && !k.anchors.some((a) => ctx.includes(a))) continue;
      candidateIds.add(k.id);
      contestIds.add(k.contestId);
      terms.add(name);
      ctx.slice(0, 3).forEach((t) => terms.add(t));
    }
    for (const m of measures) {
      if (!inScope(m.state)) continue;
      const id = m.ids.find((i) => has(text, i));
      if (!id) continue;
      const place = m.places.find(inContext);
      if (!place) continue;
      contestIds.add(m.contestId);
      terms.add(id);
      terms.add(place);
    }
    return contestIds.size ? { contestIds: [...contestIds], candidateIds: [...candidateIds], terms: [...terms] } : null;
  };
}
