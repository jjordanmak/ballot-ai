/**
 * Turns a model's answer into what may be published: every answer's quote
 * must be in the document it cites, the wording must pass the neutrality
 * lint, and (second pass) the quote must support the text. Pure functions.
 */
import { cleanText, neutralityProblem, quoteFound } from "@/lib/ai/checks";
import { CAPS, MEASURE_FIELDS, OFFICE_FIELDS, type Answer, type MeasureResearch, type OfficeResearch } from "@/lib/ai/schemas";
import type { PersonPayloadV2 } from "./person";
import type { MeasureSynthPayload, PersonPayloadV3, RacePayload } from "./synthesis";

/** Where a document comes from, in trust order (owner, 2026-10-29). */
export type SourceTier = "official" | "ballotpedia" | "news" | "campaign";

export interface StoredSource {
  url: string;
  title: string;
  publisher: string;
  official: boolean;
  fetchedAt: string;
  tier?: SourceTier;
}

/** An answer that passed the checks, citing a stored source by its uuid. */
export interface StoredAnswer {
  text: string;
  quote: string;
  source: string;
}

export type MeasureField = (typeof MEASURE_FIELDS)[number];

export interface MeasurePayload {
  kind: "measure";
  v?: 1;
  answers: Partial<Record<MeasureField, StoredAnswer>>;
  sources: Record<string, StoredSource>;
}

export type PersonPayload = PersonPayloadV2;

export type OfficeField = (typeof OFFICE_FIELDS)[number];

export interface OfficePayload {
  kind: "office";
  answers: Partial<Record<OfficeField, StoredAnswer>>;
  sources: Record<string, StoredSource>;
}

/** Where a published version applies, for the live refresh (no address: election id and state only). */
export interface PayloadScope {
  election: string;
  state: string;
}

/** Synthesized writing (WRITING_PIPELINE_PLAN.md): race intros, measures v2, people v3. */
export type SynthPayload = RacePayload | MeasureSynthPayload | PersonPayloadV3;

export type Payload = (MeasurePayload | PersonPayload | OfficePayload | SynthPayload) & { scope?: PayloadScope };

export interface FetchedDoc {
  /** "D1"… as shown to the model. */
  id: string;
  /** sources.id */
  sourceId: string;
  text: string;
  meta: StoredSource;
}

export interface Rejection {
  field: string;
  reason: "unknown source" | "quote not found" | "neutrality" | "unsupported";
  detail?: string;
  /** Synthesis: the dropped sentence, for review on the comparison page. */
  text?: string;
}

/** A claim waiting for the support check, with where to put it if it passes. */
export interface Pending {
  field: string;
  text: string;
  quote: string;
  source: string;
}

function accept(field: string, a: Pick<Answer, "text" | "quote" | "sourceId">, docs: Map<string, FetchedDoc>, rejected: Rejection[], lint = true): Pending | null {
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
  const text = cleanText(a.text, CAPS.textChars);
  const problem = lint ? neutralityProblem(text.replace(/<\/?mark>/g, "")) : null;
  if (problem) {
    rejected.push({ field, reason: "neutrality", detail: problem });
    return null;
  }
  return { field, text, quote, source: doc.sourceId };
}

/** First pass: quote and wording checks. Returns claims for the support check. */
export function screenMeasure(data: MeasureResearch, docs: FetchedDoc[]): { pending: Pending[]; rejected: Rejection[] } {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rejected: Rejection[] = [];
  const pending: Pending[] = [];
  for (const f of MEASURE_FIELDS) {
    const a = data[f];
    if (!a) continue;
    const p = accept(f, a, byId, rejected);
    if (p) pending.push(p);
  }
  return { pending, rejected };
}

export function screenOffice(data: OfficeResearch, docs: FetchedDoc[]): { pending: Pending[]; rejected: Rejection[] } {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rejected: Rejection[] = [];
  const pending: Pending[] = [];
  for (const f of OFFICE_FIELDS) {
    const a = data[f];
    if (!a) continue;
    const p = accept(f, a, byId, rejected);
    if (p) pending.push(p);
  }
  return { pending, rejected };
}

/** Second pass applied (measures and offices; people go through person.ts): keep only supported claims. */
export function buildPayload(
  kind: "measure" | "office",
  pending: Pending[],
  supported: boolean[],
  docs: FetchedDoc[],
): { payload: MeasurePayload | OfficePayload; rejected: Rejection[]; sourceIds: string[] } {
  const rejected: Rejection[] = [];
  const kept = pending.filter((p, i) => {
    if (supported[i]) return true;
    rejected.push({ field: p.field, reason: "unsupported" });
    return false;
  });
  const used = new Set(kept.map((k) => k.source));
  const sources = Object.fromEntries(docs.filter((d) => used.has(d.sourceId)).map((d) => [d.sourceId, d.meta]));
  const answers: Record<string, StoredAnswer> = {};
  for (const k of kept) answers[k.field] = { text: k.text, quote: k.quote, source: k.source };
  return kind === "measure"
    ? { payload: { kind: "measure", answers: answers as MeasurePayload["answers"], sources }, rejected, sourceIds: [...used] }
    : { payload: { kind: "office", answers: answers as OfficePayload["answers"], sources }, rejected, sourceIds: [...used] };
}

export function payloadIsEmpty(p: Payload): boolean {
  if ("sections" in p) {
    const sections = Object.values(p.sections).some((l) => l?.length);
    return p.kind === "person" ? !sections && !p.education.length && !p.positions.length && !p.mightFit.length && !p.timeline.length && !p.endorsements.length : !sections;
  }
  return p.kind === "person" ? !p.education.length && !p.positions.length && !p.platform.length && !p.bio.length : Object.keys(p.answers).length === 0;
}
