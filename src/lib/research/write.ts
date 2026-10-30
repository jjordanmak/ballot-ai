/**
 * The writing step of a research job (WRITING_PIPELINE_PLAN.md): one call
 * writes every section of an item from its document set, then
 *   code checks (synthesis.ts) → the verifier (one batched call) → the
 *   neutrality reviewer (one call) → one repair call for whatever failed,
 *   reusing the cached documents → the same checks on the repairs.
 * A unit that still fails is dropped and recorded; style slips never drop.
 *
 * The race job adds the fairness pass across a race's candidates
 * (owner, 2026-10-30): flagged sentences are rewritten, not cut.
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { AiConfig, Setting } from "@/lib/ai/config";
import { checkSupport, extract, type Doc } from "@/lib/ai/extract";
import {
  REVIEW_SYSTEM,
  REWRITE_SYSTEM,
  SYNTH_SYSTEM,
  parityTask,
  personListsTask,
  repairTask,
  reviewTask,
  rewriteTask,
  synthesisTask,
} from "@/lib/ai/prompts";
import { MeasureSynthesis, NeutralityReview, PersonLists, PersonWriting, RaceSynthesis, Rewrite } from "@/lib/ai/schemas";
import { STATE_NAMES } from "@/domain/categorize";
import { neutralityProblem } from "@/lib/ai/checks";
import { screenFacts, usedSources } from "./person";
import { positionLine } from "@/domain/profileFormat";
import {
  hardFactProblem,
  mightFitProblem,
  personUnits,
  yearsHeld,
  screenUnit,
  shapeSections,
  stripMarks,
  textHash,
  unitsOf,
  type MeasureSynthPayload,
  type Parity,
  type PersonPayloadV3,
  type RacePayload,
  type Screened,
  type SynthKind,
} from "./synthesis";
import type { Target } from "./targets";
import type { FetchedDoc, Rejection } from "./verify";
import { measureNumber } from "./targets";

type Client = Pick<Anthropic, "messages">;

export interface WriteResult {
  payload: RacePayload | MeasureSynthPayload | PersonPayloadV3 | null;
  sourceIds: string[];
  rejected: Rejection[];
  spent: number;
  usage: unknown[];
  raw: unknown;
  /** Why the job failed (an API or parse problem), when payload is null. */
  problem?: string;
  extra: Record<string, unknown>;
}

const reasonOf = (p: string): Rejection["reason"] =>
  /unknown document/.test(p) ? "unknown source" : /excerpt not found/.test(p) ? "quote not found" : /neutrality|reviewer|In Brief|Might fit/.test(p) ? "neutrality" : "unsupported";

/** The item's own names: always allowed in its prose without an excerpt. */
function ownNamesFor(t: Target): string[] {
  const state = t.state ? STATE_NAMES[t.state] ?? t.state : "";
  return [t.personName ?? "", ...(t.personName ?? "").split(/\s+/), t.office ?? "", t.division ?? "", state, t.party ?? "", ...(t.candidateNames ?? [])].filter(Boolean);
}

/** A measure's own name and number: never highlighted. */
function measureNamesFor(t: Target): string[] {
  const n = measureNumber(t.label);
  return [...t.focus, ...(n ? [`Proposition ${n}`, `Prop. ${n}`, `Measure ${n}`] : [])];
}

const excerptsOf = (s: { refs: { excerpt: string }[] }) => s.refs.map((r, i) => `[${i + 1}] "${r.excerpt}"`).join(" ");

/** The verifier and the reviewer over units that passed the code checks. Adds problems in place. */
async function judge(
  list: Screened[],
  ctx: { cfg: AiConfig; client?: Client; context: string },
): Promise<{ spent: number; usage: unknown[]; problem?: string }> {
  if (!list.length) return { spent: 0, usage: [] };
  const support = await checkSupport({
    model: ctx.cfg.checkModel,
    effort: ctx.cfg.checkEffort,
    mode: "synthesis",
    claims: list.map((s) => ({ text: stripMarks(s.text), quote: excerptsOf(s) })),
    client: ctx.client,
  });
  if (support.problem) return { spent: support.costMicroUsd, usage: [], problem: `verifier: ${support.problem}` };
  list.forEach((s, i) => {
    if (!support.supported[i]) s.problems.push("verifier: doesn't follow from its excerpts");
  });
  const live = list.filter((s) => !s.problems.length);
  if (!live.length) return { spent: support.costMicroUsd, usage: [] };
  const review = await extract({
    model: ctx.cfg.review.model,
    effort: ctx.cfg.review.effort,
    schema: NeutralityReview,
    system: REVIEW_SYSTEM,
    task: reviewTask(ctx.context, live.map((s) => ({ id: s.unit.id, text: s.text }))),
    docs: [],
    client: ctx.client,
  });
  const spent = support.costMicroUsd + review.costMicroUsd;
  if (!review.data) return { spent, usage: [review.usage ?? null], problem: `reviewer: ${review.problem}` };
  const byId = new Map(live.map((s) => [s.unit.id, s]));
  for (const f of review.data.flags) byId.get(f.id)?.problems.push(`reviewer: ${f.reason}`);
  return { spent, usage: [review.usage ?? null] };
}

/** Write one item's sections and keep only what passes every check. */
export async function writeItem(opts: { cfg: AiConfig; setting: Setting; t: Target; docs: FetchedDoc[]; now: Date; client?: Client }): Promise<WriteResult> {
  const { cfg, setting, t, now, client } = opts;
  const kind: SynthKind = t.kind === "measure" ? "measure" : t.kind === "race" ? "race" : "person";
  const judgeOnly = t.kind === "retention";
  // Measures: official analyses only (CLAUDE.md).
  const docs = kind === "measure" ? opts.docs.filter((d) => d.meta.official) : opts.docs;
  const rejected: Rejection[] = [];
  const usage: unknown[] = [];
  let spent = 0;
  const empty = (problem?: string): WriteResult => ({ payload: null, sourceIds: [], rejected, spent, usage, raw: null, problem, extra: {} });
  if (!docs.length) return empty("no official documents");

  const modelDocs: Doc[] = docs.map((d) => ({ id: d.id, title: d.meta.title, url: d.meta.url, text: d.text }));
  // Every call for this item shares the system prompt and the documents block, so later calls read both from the cache.
  const base = { model: setting.model, effort: setting.effort, system: SYNTH_SYSTEM, docs: modelDocs, cacheDocs: true, maxTokens: 24000, timeoutMs: 150_000, client };

  // People, first call: the lists, checked field by field and written by code (person.ts).
  let lists: ReturnType<typeof screenFacts> | null = null;
  let listsRaw: PersonLists | null = null;
  let years: Map<string, number | null> | undefined;
  if (kind === "person") {
    const l = await extract({ ...base, task: personListsTask(t), schema: PersonLists });
    spent += l.costMicroUsd;
    usage.push(l.usage ?? null);
    if (!l.data) return empty(l.problem);
    listsRaw = l.data;
    lists = screenFacts({ ...l.data, platform: [] }, docs, { local: !!t.local, judge: judgeOnly, now });
    rejected.push(...lists.rejected);
    years = yearsHeld(lists.positions, now);
  }

  // The writing call. People get their checked positions as P0, P1… for {{years:Pn}}.
  const call = { ...base, task: synthesisTask(t, lists?.positions.map(positionLine) ?? []) };
  const schema = kind === "measure" ? MeasureSynthesis : kind === "race" ? RaceSynthesis : PersonWriting;
  const first = await extract({ ...call, schema });
  spent += first.costMicroUsd;
  usage.push(first.usage ?? null);
  if (!first.data) return empty(first.problem);
  const data = first.data as MeasureSynthesis | RaceSynthesis | PersonWriting;
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const ctx = { docs: docMap, ownNames: ownNamesFor(t), years };
  const context = `Item: ${t.label}.`;
  const screened = unitsOf(kind, data).map((u) => screenUnit(u, ctx));

  const j1 = await judge(
    screened.filter((s) => !s.problems.length),
    { cfg, client, context },
  );
  spent += j1.spent;
  usage.push(...j1.usage);
  if (j1.problem) return empty(j1.problem);

  // One repair attempt for everything that failed (or has a style slip), reusing the cached documents.
  const needs = screened.filter((s) => s.problems.length || s.style.length);
  const repaired = new Map<string, Screened>();
  if (needs.length) {
    const rep = await extract({
      ...call,
      schema: Rewrite,
      followUp: { answer: JSON.stringify(data), task: repairTask(needs.map((s) => ({ id: s.unit.id, text: s.text, reasons: [...s.problems, ...s.style] }))) },
    });
    spent += rep.costMicroUsd;
    usage.push(rep.usage ?? null);
    const byId = new Map(needs.map((s) => [s.unit.id, s]));
    for (const r of rep.data?.units ?? []) {
      const orig = byId.get(r.id);
      if (!orig || repaired.has(r.id)) continue;
      repaired.set(r.id, screenUnit({ ...orig.unit, text: r.text, refs: r.refs }, ctx));
    }
    const j2 = await judge(
      [...repaired.values()].filter((s) => !s.problems.length),
      { cfg, client, context },
    );
    spent += j2.spent;
    usage.push(...j2.usage);
    if (j2.problem) return empty(j2.problem);
  }

  const kept: Screened[] = [];
  for (const s of screened) {
    if (!s.problems.length && !s.style.length) {
      kept.push(s);
      continue;
    }
    const r = repaired.get(s.unit.id);
    if (r && !r.problems.length) kept.push(r);
    else if (!s.problems.length) kept.push(s); // style only: never dropped
    else for (const p of s.problems) rejected.push({ field: s.unit.id, reason: reasonOf(p), detail: p, text: stripMarks(s.text) });
  }

  const shaped = shapeSections(kind, kept, { measureNames: kind === "measure" ? measureNamesFor(t) : [], judge: judgeOnly });
  const refSources = kept.flatMap((s) => s.refs.map((r) => r.source));
  let payload: WriteResult["payload"];
  let listSources: string[] = [];
  if (kind === "person") {
    const strip = <T extends { tier?: unknown }>(x: T) => {
      const { tier: _tier, ...rest } = x;
      return rest;
    };
    const l = lists!;
    listSources = [...l.education, ...l.positions, ...(l.residence ? [l.residence] : [])].map((x) => x.source);
    payload = {
      kind: "person",
      v: 3,
      education: l.education.map(strip),
      positions: l.positions.map(strip),
      ...(l.residence ? { residence: l.residence } : {}),
      sections: shaped.sections,
      mightFit: shaped.mightFit,
      timeline: shaped.timeline,
      endorsements: shaped.endorsements,
      limited: shaped.limited,
      sources: {},
    };
  } else if (kind === "race") payload = { kind: "race", v: 1, sections: shaped.sections, limited: shaped.limited, sources: {} };
  else payload = { kind: "measure", v: 2, sections: shaped.sections, limited: shaped.limited, sources: {} };
  const sourceIds = [...new Set([...listSources, ...refSources])];
  payload.sources = usedSources(docs, sourceIds);
  const leftOut = listsRaw ? listsRaw.leftOut.slice(0, 10) : undefined;
  return { payload, sourceIds, rejected, spent, usage, raw: listsRaw ? { lists: listsRaw, writing: data } : data, extra: { leftOut, conflicts: lists?.conflicts, repaired: repaired.size } };
}

/**
 * The race-level fairness pass: every candidate's sections side by side.
 * Flagged units are rewritten to fit the rubric, keeping their facts and
 * excerpts; a rewrite must pass the code checks, the verifier and the
 * reviewer, or the unit is listed as unresolved (and dropped on the page).
 */
export async function parityPass(opts: {
  cfg: AiConfig;
  t: Target;
  candidates: { target: string; label: string; payload: PersonPayloadV3 }[];
  missing: string[];
  client?: Client;
}): Promise<{ parity: Parity; spent: number; usage: unknown[]; problem?: string }> {
  const { cfg, t, client } = opts;
  const parity: Parity = { rewrites: [], unresolved: [], missing: opts.missing, thin: [] };
  let spent = 0;
  const usage: unknown[] = [];
  if (opts.candidates.length < 2) return { parity, spent, usage };

  // Thin coverage: sections one candidate has that another doesn't. Reported only.
  const allSections = new Set(opts.candidates.flatMap((c) => personUnits(c.payload).map((u) => u.section)));
  for (const c of opts.candidates) {
    const mine = new Set(personUnits(c.payload).map((u) => u.section));
    const lacking = [...allSections].filter((s) => !mine.has(s));
    if (lacking.length) parity.thin.push({ target: c.target, sections: lacking });
  }

  const tagged = opts.candidates.map((c, i) => ({ ...c, tag: `c${i + 1}`, units: personUnits(c.payload) }));
  const review = await extract({
    model: cfg.review.model,
    effort: cfg.review.effort,
    schema: NeutralityReview,
    system: REVIEW_SYSTEM,
    task: parityTask(
      t.label,
      tagged.map((c) => ({ label: `${c.tag}: ${c.label}`, units: c.units.map((u) => ({ id: `${c.tag}/${u.id}`, text: u.text })) })),
    ),
    docs: [],
    client,
  });
  spent += review.costMicroUsd;
  usage.push(review.usage ?? null);
  if (!review.data) return { parity, spent, usage, problem: `parity reviewer: ${review.problem}` };

  const flagged = review.data.flags
    .map((f) => {
      const [tag, id] = f.id.split("/");
      const c = tagged.find((x) => x.tag === tag);
      const u = c?.units.find((x) => x.id === id);
      return c && u ? { c, u, reason: f.reason, id: f.id } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 24);
  if (!flagged.length) return { parity, spent, usage };

  const rewrite = await extract({
    model: cfg.review.model,
    effort: cfg.review.effort,
    schema: Rewrite,
    system: REWRITE_SYSTEM,
    task: rewriteTask(
      flagged.map((f) => ({
        id: f.id,
        text: f.u.text,
        reason: f.reason,
        excerpts: f.u.refs.map((r) => r.excerpt),
        peers: tagged.filter((x) => x !== f.c).flatMap((x) => x.units.filter((u) => u.section === f.u.section).map((u) => u.text)).slice(0, 6),
      })),
    ),
    docs: [],
    client,
  });
  spent += rewrite.costMicroUsd;
  usage.push(rewrite.usage ?? null);
  const texts = new Map((rewrite.data?.units ?? []).map((u) => [u.id, u.text]));

  // The same checks as any sentence: hard facts against the unit's own excerpts, the lint, the verifier and the reviewer.
  const ownNames = [...ownNamesFor(t), ...opts.candidates.map((c) => c.label)];
  const candidates = flagged.map((f) => {
    const raw = texts.get(f.id);
    const timeline = f.u.section === "timeline";
    const text = raw ? (timeline ? raw.replace(/^[^:]{1,40}:\s*/, "") : raw).trim() : "";
    const plain = stripMarks(text);
    const problem = !text
      ? "no rewrite"
      : (hardFactProblem(plain, f.u.refs.map((r) => r.excerpt), ownNames) ??
        neutralityProblem(plain) ??
        (f.u.section === "mightFit" ? mightFitProblem(plain) : null));
    return { f, text: f.u.section === "mightFit" || timeline ? plain : text, problem };
  });
  const toCheck = candidates.filter((c) => !c.problem);
  if (toCheck.length) {
    const support = await checkSupport({ model: cfg.checkModel, effort: cfg.checkEffort, mode: "synthesis", claims: toCheck.map((c) => ({ text: stripMarks(c.text), quote: excerptsOf(c.f.u) })), client });
    spent += support.costMicroUsd;
    toCheck.forEach((c, i) => {
      if (!support.supported[i]) c.problem = support.problem ? `verifier: ${support.problem}` : "verifier: doesn't follow from its excerpts";
    });
    const live = toCheck.filter((c) => !c.problem);
    if (live.length) {
      const r2 = await extract({ model: cfg.review.model, effort: cfg.review.effort, schema: NeutralityReview, system: REVIEW_SYSTEM, task: reviewTask(`Race: ${t.label}.`, live.map((c) => ({ id: c.f.id, text: c.text }))), docs: [], client });
      spent += r2.costMicroUsd;
      usage.push(r2.usage ?? null);
      const flags = new Map((r2.data?.flags ?? []).map((x) => [x.id, x.reason]));
      for (const c of live) if (!r2.data || flags.has(c.f.id)) c.problem = r2.data ? `reviewer: ${flags.get(c.f.id)}` : `reviewer: ${r2.problem}`;
    }
  }
  for (const c of candidates) {
    const original = c.f.c.payload;
    const stored = c.f.u.section === "timeline" ? original.timeline[Number(c.f.u.id.split(".")[1])]?.text ?? c.f.u.text : c.f.u.text;
    if (c.problem) parity.unresolved.push({ target: c.f.c.target, unit: c.f.u.id, reason: `${c.f.reason} (rewrite failed: ${c.problem})` });
    else parity.rewrites.push({ target: c.f.c.target, unit: c.f.u.id, fromHash: textHash(stored), text: c.text });
  }
  return { parity, spent, usage };
}
