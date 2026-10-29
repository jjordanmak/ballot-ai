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
  candidates: TrackedCandidate[];
}

export interface SourceContext {
  scope: "national" | "ca" | "local";
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

const STATE_NAMES: Record<string, string> = { CA: "california" };
const GENERIC_PLACE_WORDS = /\b(county|of|city|town|district|unified|high school|elementary|school|community college|college|trustee area \w+|\d+(st|nd|rd|th)|congressional|assembly|supervisorial|\d{4}|the)\b/g;
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

const has = (hay: string, needle: string) => needle.length > 0 && hay.includes(` ${needle} `);

/** "Donald P. (Don) Wagner" → donald p don wagner, donald p wagner, donald wagner, don wagner. */
export function nameVariants(name: string): string[] {
  const nick = /\(([^)]+)\)/.exec(name)?.[1];
  const base = normalizeForMatch(name.replace(/\([^)]*\)/g, " "));
  const toks = base.split(" ").filter(Boolean);
  if (toks.length < 2) return base ? [base] : [];
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
  variants: string[];
  context: string[];
  needed: number;
}

interface CompiledMeasure {
  contestId: string;
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
      measures.push({ contestId: c.id, ids: measureIds(c.title), places: [place, stateName].filter((x): x is string => !!x) });
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
        variants,
        context: [...new Set([...officeTerms(c.title), place, stateName ?? "", ...ELECTION_TERMS, ...opponents].filter(Boolean))],
        needed: shared || shortest <= 9 ? 2 : 1,
      });
    }
  }

  return function match(title: string, summary: string, source: SourceContext): MatchResult | null {
    const text = ` ${normalizeForMatch(`${title} ${summary}`)} `;
    const implied = [
      ...(source.scope !== "national" ? ["california"] : []),
      ...(source.jurisdictions ?? []).map((j) => normalizeForMatch(j)),
    ];
    const inContext = (term: string) => has(text, term) || implied.includes(term);
    const contestIds = new Set<string>();
    const candidateIds = new Set<string>();
    const terms = new Set<string>();

    for (const k of candidates) {
      const name = k.variants.find((v) => has(text, v));
      if (!name) continue;
      const ctx = k.context.filter(inContext);
      if (ctx.length < k.needed) continue;
      candidateIds.add(k.id);
      contestIds.add(k.contestId);
      terms.add(name);
      ctx.slice(0, 3).forEach((t) => terms.add(t));
    }
    for (const m of measures) {
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
