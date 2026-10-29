/**
 * Read path for the research pipeline: the published, current answers for
 * the contests and candidates on one ballot, merged under the hand-curated
 * enrichment (curated fields always win). One query; page loads never call
 * Claude. Merged fields are listed in `aiFields` so the UI labels them
 * "AI summary of the sources".
 */
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { CandidateEnrichment, Cited, ContestEnrichment, EnrichmentBundle, MeasureEnrichment, SourceDoc } from "@/domain/enrichment";
import { educationLine, positionYears } from "@/domain/profileFormat";
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
  return !!p && typeof p === "object" && ["measure", "person", "office"].includes((p as Payload).kind);
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

/** Pure: the bundle with this ballot's published research merged in. */
export function withResearch(bundle: EnrichmentBundle, ballot: Pick<ResolvedBallot, "contests"> & { location?: { state?: string } }, rows: ResearchRow[]): EnrichmentBundle {
  if (!rows.length) return bundle;
  const byId = new Map(rows.filter((r) => isPayload(r.payload)).map((r) => [r.target_id, r.payload as Payload]));
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
      out.measures![key] = mergeMeasure(out.measures![key], p);
      addSources(p);
      continue;
    }
    const op = byId.get(officeTargetId(c, ballot.location?.state));
    if (op?.kind === "office") {
      const key = contestKey(c);
      out.contests![key] = mergeOffice(out.contests![key], op);
      addSources(op);
    }
    for (const ch of c.choices) {
      const p = ch.durableId ? byId.get(ch.durableId) : undefined;
      if (p?.kind !== "person") continue;
      const key = candidateKey(c, ch);
      out.candidates![key] = mergePerson(out.candidates![key], p);
      addSources(p);
    }
  }
  return out;
}

/** Ids on this ballot that may have research: measures, candidates, and each race's office. */
export function researchTargetIds(ballot: Pick<ResolvedBallot, "contests"> & { location?: { state?: string } }): string[] {
  return ballot.contests
    .flatMap((c) => (c.kind === "measure" ? [c.durableId] : [...c.choices.map((ch) => ch.durableId), officeTargetId(c, ballot.location?.state)]))
    .filter((x): x is string => !!x);
}
