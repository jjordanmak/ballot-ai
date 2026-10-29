/**
 * Turns a model's answer into what may be published: every answer's quote
 * must be in the document it cites, the wording must pass the neutrality
 * lint, and (second pass) the quote must support the text. Pure functions.
 */
import { cleanText, neutralityProblem, quoteFound } from "@/lib/ai/checks";
import { CAPS, MEASURE_FIELDS, type Answer, type MeasureResearch, type PersonResearch, type Position } from "@/lib/ai/schemas";

export interface StoredSource {
  url: string;
  title: string;
  publisher: string;
  official: boolean;
  fetchedAt: string;
}

/** An answer that passed the checks, citing a stored source by its uuid. */
export interface StoredAnswer {
  text: string;
  quote: string;
  source: string;
}

export interface StoredPosition {
  title: string;
  organization?: string;
  years?: string;
  quote: string;
  source: string;
}

export type MeasureField = (typeof MEASURE_FIELDS)[number];

export interface MeasurePayload {
  kind: "measure";
  answers: Partial<Record<MeasureField, StoredAnswer>>;
  sources: Record<string, StoredSource>;
}

export interface PersonPayload {
  kind: "person";
  currentRole?: StoredAnswer;
  background: StoredAnswer[];
  pastPositions: StoredPosition[];
  priorities: StoredAnswer[];
  sources: Record<string, StoredSource>;
}

export type Payload = MeasurePayload | PersonPayload;

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

export function screenPerson(data: PersonResearch, docs: FetchedDoc[]): { pending: Pending[]; rejected: Rejection[] } {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rejected: Rejection[] = [];
  const pending: Pending[] = [];
  const push = (p: Pending | null) => p && pending.push(p);
  if (data.currentRole) push(accept("currentRole", data.currentRole, byId, rejected));
  data.background.slice(0, CAPS.background).forEach((a, i) => push(accept(`background.${i}`, a, byId, rejected)));
  data.priorities.slice(0, CAPS.priorities).forEach((a, i) => push(accept(`priorities.${i}`, a, byId, rejected)));
  data.pastPositions.slice(0, CAPS.pastPositions).forEach((p: Position, i) =>
    push(
      accept(
        `pastPositions.${i}`,
        { text: [p.title, p.organization, p.years].filter(Boolean).join(", "), quote: p.quote, sourceId: p.sourceId },
        byId,
        rejected,
      ),
    ),
  );
  return { pending, rejected };
}

/** Second pass applied: keep only supported claims, in the payload shape. */
export function buildPayload(
  kind: "measure" | "person",
  pending: Pending[],
  supported: boolean[],
  docs: FetchedDoc[],
  positions: Position[] = [],
): { payload: Payload; rejected: Rejection[]; sourceIds: string[] } {
  const rejected: Rejection[] = [];
  const kept = pending.filter((p, i) => {
    if (supported[i]) return true;
    rejected.push({ field: p.field, reason: "unsupported" });
    return false;
  });
  const used = new Set(kept.map((k) => k.source));
  const sources = Object.fromEntries(docs.filter((d) => used.has(d.sourceId)).map((d) => [d.sourceId, d.meta]));
  const answer = (k: Pending): StoredAnswer => ({ text: k.text, quote: k.quote, source: k.source });

  if (kind === "measure") {
    const answers: MeasurePayload["answers"] = {};
    for (const k of kept) answers[k.field as MeasureField] = answer(k);
    return { payload: { kind: "measure", answers, sources }, rejected, sourceIds: [...used] };
  }
  const person: PersonPayload = { kind: "person", background: [], pastPositions: [], priorities: [], sources };
  for (const k of kept) {
    const [group, idx] = k.field.split(".");
    if (group === "currentRole") person.currentRole = answer(k);
    else if (group === "background") person.background.push(answer(k));
    else if (group === "priorities") person.priorities.push(answer(k));
    else if (group === "pastPositions") {
      const p = positions[Number(idx)];
      person.pastPositions.push({
        title: cleanText(p?.title ?? k.text, 160),
        organization: p?.organization ? cleanText(p.organization, 160) : undefined,
        years: p?.years ? cleanText(p.years, 40) : undefined,
        quote: k.quote,
        source: k.source,
      });
    }
  }
  return { payload: person, rejected, sourceIds: [...used] };
}

export function payloadIsEmpty(p: Payload): boolean {
  return p.kind === "measure"
    ? Object.keys(p.answers).length === 0
    : !p.currentRole && !p.background.length && !p.pastPositions.length && !p.priorities.length;
}
