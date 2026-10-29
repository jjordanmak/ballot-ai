/**
 * Read path for the research pipeline: the published, current answers for
 * the contests and candidates on one ballot, merged under the hand-curated
 * enrichment (curated fields always win). One query; page loads never call
 * Claude. Merged fields are listed in `aiFields` so the UI labels them
 * "AI summary of the sources".
 */
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { CandidateEnrichment, Cited, EnrichmentBundle, MeasureEnrichment, SourceDoc } from "@/domain/enrichment";
import type { MeasurePayload, Payload, PersonPayload, StoredAnswer, StoredSource } from "@/lib/research/verify";
import { candidateKey, measureKey } from "./enrichmentKeys";

export interface ResearchRow {
  target_id: string;
  payload: unknown;
}

const docId = (sourceId: string) => `ai-${sourceId}`;

function sourceDoc(s: StoredSource): SourceDoc {
  return { title: s.title, publisher: s.publisher, url: s.url, official: s.official, accessed: s.fetchedAt.slice(0, 10) };
}

const cited = (a: StoredAnswer): Cited => ({ text: a.text, sources: [docId(a.source)] });

function isPayload(p: unknown): p is Payload {
  return !!p && typeof p === "object" && ((p as Payload).kind === "measure" || (p as Payload).kind === "person");
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
  if (p.currentRole && !out.currentRole) {
    out.currentRole = cited(p.currentRole);
    ai.push("currentRole");
  }
  if (p.background.length && !out.background?.length) {
    out.background = p.background.map(cited);
    ai.push("background");
  }
  if (p.pastPositions.length && !out.pastPositions?.length) {
    out.pastPositions = p.pastPositions.map((x) => ({ title: x.title, organization: x.organization, years: x.years, sources: [docId(x.source)] }));
    ai.push("pastPositions");
  }
  if (p.priorities.length && !out.priorities?.length) {
    out.priorities = p.priorities.map(cited);
    ai.push("priorities");
  }
  if (ai.length) out.aiFields = [...(cur?.aiFields ?? []), ...ai];
  return out;
}

/** Pure: the bundle with this ballot's published research merged in. */
export function withResearch(bundle: EnrichmentBundle, ballot: Pick<ResolvedBallot, "contests">, rows: ResearchRow[]): EnrichmentBundle {
  if (!rows.length) return bundle;
  const byId = new Map(rows.filter((r) => isPayload(r.payload)).map((r) => [r.target_id, r.payload as Payload]));
  const out: EnrichmentBundle = {
    ...bundle,
    sources: { ...bundle.sources },
    measures: { ...(bundle.measures ?? {}) },
    candidates: { ...(bundle.candidates ?? {}) },
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

/** Durable ids on this ballot that may have research. */
export function researchTargetIds(ballot: Pick<ResolvedBallot, "contests">): string[] {
  return ballot.contests.flatMap((c) => (c.kind === "measure" ? [c.durableId] : c.choices.map((ch) => ch.durableId))).filter((x): x is string => !!x);
}
