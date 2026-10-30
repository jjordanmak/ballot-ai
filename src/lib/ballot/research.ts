/**
 * Read path for the research pipeline: the published, current answers for
 * the contests and candidates on one ballot, merged under the hand-curated
 * enrichment (curated fields always win). One query; page loads never call
 * Claude. Merged fields are listed in `aiFields` so the UI labels them
 * "AI summary of the sources".
 */
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { CandidateEnrichment, Cited, ContestEnrichment, EnrichmentBundle, MeasureEnrichment, SourceDoc } from "@/domain/enrichment";
import { educationLine, positionTitle, positionYears } from "@/domain/profileFormat";
import { applyParity, stripMarks, trimMarksToParity, type MeasureSynthPayload, type PersonPayloadV3, type RacePayload, type StoredSentence } from "@/lib/research/synthesis";
import { officeKeyFor } from "@/lib/research/targets";
import type { MeasurePayload, OfficePayload, Payload, PersonPayload, StoredAnswer, StoredSource } from "@/lib/research/verify";
import { candidateKey, contestKey, measureKey } from "./enrichmentKeys";

export interface ResearchRow {
  target_id: string;
  payload: unknown;
}

const docId = (sourceId: string) => `ai-${sourceId}`;

function sourceDoc(s: StoredSource): SourceDoc {
  return { title: s.title, publisher: s.publisher, url: s.url, official: s.official, accessed: s.fetchedAt.slice(0, 10) };
}

const cited = (a: StoredAnswer): Cited => ({ text: a.text, sources: [docId(a.source)], quotes: [a.quote] });

function isPayload(p: unknown): p is Payload {
  return !!p && typeof p === "object" && ["measure", "person", "office", "race"].includes((p as Payload).kind);
}

/** One synthesized sentence: its sources (deduped) and, for each, its excerpts (the [n] popover). */
function sentenceCited(s: StoredSentence): Cited {
  const by = new Map<string, string[]>();
  for (const r of s.refs) by.set(r.source, [...(by.get(r.source) ?? []), r.excerpt]);
  return { text: s.text, sources: [...by.keys()].map(docId), quotes: [...by.values()].map((x) => x.join(" … ")) };
}

/** A synthesized section: the joined text and every source, plus each sentence with its own. */
function prose(list: StoredSentence[]): Cited {
  const sentences = list.map(sentenceCited);
  const seen = new Map<string, string | undefined>();
  for (const c of sentences) c.sources.forEach((id, i) => (seen.has(id) ? null : seen.set(id, c.quotes?.[i])));
  return { text: sentences.map((c) => c.text).join(" "), sources: [...seen.keys()], quotes: [...seen.values()], sentences };
}

const offMarks = <T extends { text: string }>(x: T): T => ({ ...x, text: stripMarks(x.text) });

/** The highlight off switch (AI_HIGHLIGHTS=off): every <mark> in synthesized text goes. */
function withoutMarks<P extends Payload>(p: P): P {
  if (!("sections" in p)) return p;
  const sections = Object.fromEntries(Object.entries(p.sections).map(([k, l]) => [k, (l ?? []).map(offMarks)]));
  return { ...p, sections } as P;
}

function mergeMeasureSynth(cur: MeasureEnrichment | undefined, p: MeasureSynthPayload): MeasureEnrichment {
  const out: MeasureEnrichment = { ...(cur ?? {}), impact: { ...(cur?.impact ?? {}) } };
  const ai: string[] = [];
  for (const f of ["summary", "yesMeans", "noMeans"] as const) {
    const list = p.sections[f];
    if (list?.length && !out[f]) {
      out[f] = prose(list);
      ai.push(f);
    }
  }
  for (const f of ["taxes", "cost", "money", "affected", "currentLaw", "kind"] as const) {
    const list = p.sections[f];
    if (list?.length && !out.impact![f]) {
      out.impact![f] = prose(list);
      ai.push(`impact.${f}`);
    }
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  const limited = p.limited.map((f) => (["summary", "yesMeans", "noMeans"].includes(f) ? f : `impact.${f}`));
  if (limited.length) out.limited = [...(cur?.limited ?? []), ...limited];
  return out;
}

/** People v3: written sections, code-written lists. Curated fields win. */
function mergePersonSynth(cur: CandidateEnrichment | undefined, p: PersonPayloadV3): CandidateEnrichment {
  const out: CandidateEnrichment = { ...(cur ?? {}) };
  const ai: string[] = [];
  const ref = (x: { quote: string; source: string }) => ({ sources: [docId(x.source)], quotes: [x.quote] });
  const current = p.positions.find((x) => x.endYear === "present");
  if (current && !out.currentRole) {
    out.currentRole = { text: [current.title, current.organization].filter(Boolean).join(", "), ...ref(current) };
    ai.push("currentRole");
  }
  const set = <K extends "inBrief" | "bio" | "priorities" | "stances">(key: K, list: StoredSentence[] | undefined) => {
    if (list?.length && !out[key]?.length) {
      out[key] = list.map(sentenceCited);
      ai.push(key);
    }
  };
  set("inBrief", p.sections.inBrief);
  set("bio", p.sections.background);
  set("priorities", p.sections.priorities);
  set("stances", p.sections.stances);
  if (p.mightFit.length && !out.mightFit?.length) {
    out.mightFit = p.mightFit.map(sentenceCited);
    ai.push("mightFit");
  }
  if (p.timeline.length && !out.timeline?.length) {
    out.timeline = p.timeline.map((t) => {
      const c = sentenceCited(t);
      return { year: t.when, event: c.text, sources: c.sources, quotes: c.quotes };
    });
    ai.push("timeline");
  }
  if (p.endorsements.length && !out.endorsements?.length) {
    out.endorsements = p.endorsements.map((e) => {
      const c = sentenceCited({ text: e.name, refs: e.refs });
      return { name: e.name, category: e.category, sources: c.sources, quotes: c.quotes };
    });
    ai.push("endorsements");
  }
  if (p.education.length && !out.education?.length) {
    out.education = p.education.map((e) => ({ text: educationLine(e), ...ref(e) }));
    ai.push("education");
  }
  if (p.positions.length && !out.pastPositions?.length) {
    out.pastPositions = p.positions.map((x) => ({ title: positionTitle(x), years: positionYears(x) || undefined, committees: x.committees?.length ? x.committees : undefined, ...ref(x) }));
    ai.push("pastPositions");
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  const limited = p.limited.map((f) => (f === "background" ? "bio" : f));
  if (limited.length) out.limited = [...(cur?.limited ?? []), ...limited];
  return out;
}

function mergeRace(cur: ContestEnrichment | undefined, p: RacePayload): ContestEnrichment {
  const out: ContestEnrichment = { ...(cur ?? {}) };
  const ai: string[] = [];
  for (const f of ["context", "whyItMatters", "whatsAtStake", "bigPicture"] as const) {
    const list = p.sections[f];
    if (list?.length && !out[f]) {
      out[f] = prose(list);
      ai.push(f);
    }
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  if (p.limited.length) out.limited = [...(cur?.limited ?? []), ...p.limited];
  return out;
}

function mergeMeasure(cur: MeasureEnrichment | undefined, p: MeasurePayload): MeasureEnrichment {
  const out: MeasureEnrichment = { ...(cur ?? {}), impact: { ...(cur?.impact ?? {}) } };
  const ai: string[] = [];
  for (const f of ["summary", "yesMeans", "noMeans"] as const) {
    const a = p.answers[f];
    if (a && !out[f]) {
      out[f] = cited(a);
      ai.push(f);
    }
  }
  for (const f of ["taxes", "cost", "money", "affected", "currentLaw", "kind"] as const) {
    const a = p.answers[f];
    if (a && !out.impact![f]) {
      out.impact![f] = cited(a);
      ai.push(`impact.${f}`);
    }
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  return out;
}

function mergePerson(cur: CandidateEnrichment | undefined, p: PersonPayload): CandidateEnrichment {
  const out: CandidateEnrichment = { ...(cur ?? {}) };
  const ai: string[] = [];
  if (p.v !== 2) return out; // superseded shape (first comparison pass); never published
  const ref = (x: { quote: string; source: string }) => ({ sources: [docId(x.source)], quotes: [x.quote] });
  const current = p.positions.find((x) => x.endYear === "present");
  if (current && !out.currentRole) {
    out.currentRole = { text: [current.title, current.organization].filter(Boolean).join(", "), ...ref(current) };
    ai.push("currentRole");
  }
  if (p.bio.length && !out.bio?.length) {
    // Each sentence cites the facts it was written from.
    const facts = new Map<string, { quote: string; source: string }>([
      ...p.positions.map((x, i) => [`P${i}`, x] as const),
      ...p.education.map((x, i) => [`E${i}`, x] as const),
      ...p.platform.map((x, i) => [`L${i}`, x] as const),
      ...(p.residence ? [["R", p.residence] as const] : []),
    ]);
    out.bio = p.bio.map((s) => {
      const refs = s.facts.map((id) => facts.get(id)).filter((x): x is { quote: string; source: string } => !!x);
      const seen = new Set<string>();
      const uniq = refs.filter((r) => !seen.has(r.source) && seen.add(r.source));
      return { text: s.text, sources: uniq.map((r) => docId(r.source)), quotes: uniq.map((r) => r.quote) };
    });
    ai.push("bio");
  }
  if (p.education.length && !out.education?.length) {
    out.education = p.education.map((e) => ({ text: educationLine(e), ...ref(e) }));
    ai.push("education");
  }
  if (p.positions.length && !out.pastPositions?.length) {
    out.pastPositions = p.positions.map((x) => ({
      title: [x.title, x.organization && !x.title.toLowerCase().includes(x.organization.toLowerCase()) ? x.organization : null].filter(Boolean).join(", ") + (x.district ? ` (${x.district})` : ""),
      years: positionYears(x) || undefined,
      committees: x.committees?.length ? x.committees : undefined,
      ...ref(x),
    }));
    ai.push("pastPositions");
  }
  if (p.platform.length && !out.platform?.length) {
    out.platform = p.platform.map((x) => ({ text: x.text, ...ref(x) }));
    ai.push("platform");
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  return out;
}

function mergeOffice(cur: ContestEnrichment | undefined, p: OfficePayload): ContestEnrichment {
  const out: ContestEnrichment = { ...(cur ?? {}), office: { ...(cur?.office ?? {}) } };
  const ai: string[] = [];
  for (const f of ["duties", "term", "seats", "salary"] as const) {
    const a = p.answers[f];
    if (a && !out.office![f]) {
      out.office![f] = cited(a);
      ai.push(`office.${f}`);
    }
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  return out;
}

const LEGISLATIVE = /assembly|state senate|senator|representative|congress|house of delegates|legislature/i;

/** The office research key for a contest on a ballot (same function the job uses). */
export function officeTargetId(c: Contest, state: string | undefined): string {
  state ||= /\/state:([a-z]{2})/.exec(c.division.ocdId ?? "")?.[1];
  const statewide = c.division.scope === "statewide" || /^ocd-division\/country:us\/(state:[a-z]{2}|district:dc)$/.test(c.division.ocdId ?? "");
  return officeKeyFor({ title: c.title, divisionName: c.division.name ?? "", state, statewideOrLegislative: statewide || LEGISLATIVE.test(c.title) }).key;
}

/**
 * Pure: the bundle with this ballot's research merged in (published rows,
 * or one round's held rows on a preview). A race's fairness rewrites are
 * applied to its candidates, and highlights are evened out across them.
 */
export function withResearch(
  bundle: EnrichmentBundle,
  ballot: Pick<ResolvedBallot, "contests"> & { location?: { state?: string } },
  rows: ResearchRow[],
  opts: { highlights?: boolean } = {},
): EnrichmentBundle {
  if (!rows.length) return bundle;
  const byId = new Map(
    rows.filter((r) => isPayload(r.payload)).map((r) => [r.target_id, opts.highlights === false ? withoutMarks(r.payload as Payload) : (r.payload as Payload)]),
  );
  const out: EnrichmentBundle = {
    ...bundle,
    sources: { ...bundle.sources },
    measures: { ...(bundle.measures ?? {}) },
    candidates: { ...(bundle.candidates ?? {}) },
    contests: { ...(bundle.contests ?? {}) },
  };
  const addSources = (p: Payload) => {
    for (const [id, s] of Object.entries(p.sources)) out.sources[docId(id)] = sourceDoc(s);
  };
  for (const c of ballot.contests as Contest[]) {
    if (c.kind === "measure") {
      const p = c.durableId ? byId.get(c.durableId) : undefined;
      if (p?.kind !== "measure") continue;
      const key = measureKey(c);
      out.measures![key] = p.v === 2 ? mergeMeasureSynth(out.measures![key], p) : mergeMeasure(out.measures![key], p);
      addSources(p);
      continue;
    }
    const op = byId.get(officeTargetId(c, ballot.location?.state));
    if (op?.kind === "office") {
      const key = contestKey(c);
      out.contests![key] = mergeOffice(out.contests![key], op);
      addSources(op);
    }
    const race = c.durableId ? byId.get(c.durableId) : undefined;
    if (race?.kind === "race") {
      const key = contestKey(c);
      out.contests![key] = mergeRace(out.contests![key], race);
      addSources(race);
    }
    // Every candidate in the race: the fairness rewrites, then highlight counts within 1 of each other.
    const people = c.choices.map((ch) => {
      const p = ch.durableId ? byId.get(ch.durableId) : undefined;
      return p?.kind === "person" ? { ch, p } : null;
    });
    const v3 = people.filter((x): x is { ch: (typeof c.choices)[number]; p: PersonPayloadV3 } => !!x && x.p.v === 3);
    const even = trimMarksToParity(v3.map((x) => applyParity(x.p, x.ch.durableId!, race?.kind === "race" ? race.parity : undefined)));
    v3.forEach((x, i) => (x.p = even[i]));
    for (const x of people) {
      if (!x) continue;
      const key = candidateKey(c, x.ch);
      out.candidates![key] = x.p.v === 3 ? mergePersonSynth(out.candidates![key], x.p) : mergePerson(out.candidates![key], x.p);
      addSources(x.p);
    }
  }
  return out;
}

/** Ids on this ballot that may have research: measures, candidates, each race's intro (its contest id) and its office. */
export function researchTargetIds(ballot: Pick<ResolvedBallot, "contests"> & { location?: { state?: string } }): string[] {
  return ballot.contests
    .flatMap((c) => (c.kind === "measure" ? [c.durableId] : [...c.choices.map((ch) => ch.durableId), c.durableId, officeTargetId(c, ballot.location?.state)]))
    .filter((x): x is string => !!x);
}
