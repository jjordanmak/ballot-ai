/**
 * Data for the model comparison page (/internal/compare): every setting's
 * result for every item in the comparison set, side by side, plus a
 * per-setting summary. Grouping is pure (tested); `loadComparison` reads it.
 */
import type { Setting } from "@/lib/ai/config";
import { settingId } from "@/lib/ai/config";
import { educationLine, positionLine } from "@/domain/profileFormat";
import type { Payload, StoredAnswer, StoredSource } from "./verify";

export interface CompareTarget {
  key: string;
  kind: "measure" | "retention" | "candidate" | "office";
  label: string;
  group: string;
}

export interface RunInfo {
  costMicroUsd?: number;
  seconds?: number;
  rejected?: { field: string; reason: string; detail?: string }[];
  raw?: unknown;
  /** Facts the model found but left out under the rules, and why (compare mode, people). */
  leftOut?: { fact: string; reason: string }[];
  /** Where two sources disagreed and which one was kept. */
  conflicts?: { fact: string; kept: string; dropped: string }[];
  /** Every page the job tried for this item, and what happened. */
  tried?: { url: string; outcome: string }[];
  usage?: { input_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null;
}

export interface CellInput {
  /** `${target key}@${model}:${effort}` */
  stateKey: string;
  payload?: Payload | null;
  run?: RunInfo | null;
  /** research_state.last_outcome when there's no result yet (no documents, failed, waiting…). */
  outcome?: string | null;
}

/** One supporting quote and where it's from (shown in the [n] popover, never inline). */
export interface Ref {
  quote: string;
  source?: StoredSource;
}

export interface Line {
  text: string;
  refs: Ref[];
  /** A second, smaller line (a legislative office's committees). */
  sub?: string;
}

export interface Cell {
  setting: string;
  status: "done" | "pending" | "no documents" | "failed" | "other";
  outcome?: string | null;
  fields: Record<string, Line[]>;
  rejected: { field: string; reason: string; detail?: string }[];
  leftOut: { fact: string; reason: string }[];
  conflicts: { fact: string; kept: string; dropped: string }[];
  tried: { url: string; outcome: string }[];
  costMicroUsd: number;
  seconds?: number;
}

export interface Item {
  target: CompareTarget;
  fields: { key: string; label: string }[];
  cells: Cell[];
  /** Fields where the settings' answers aren't all the same. */
  differing: string[];
}

export interface SettingSummary {
  setting: string;
  items: number;
  done: number;
  costMicroUsd: number;
  avgSeconds: number | null;
  kept: number;
  rejectedByReason: Record<string, number>;
  blank: number;
  /** Share of input tokens read from the prompt cache (0–1), or null before any run. */
  cachedShare: number | null;
}

const FIELDS: Record<CompareTarget["kind"], { key: string; label: string }[]> = {
  measure: [
    { key: "summary", label: "What it does" },
    { key: "yesMeans", label: "A YES vote means" },
    { key: "noMeans", label: "A NO vote means" },
    { key: "taxes", label: "Taxes or fees" },
    { key: "cost", label: "Cost to government" },
    { key: "money", label: "Where the money goes" },
    { key: "affected", label: "Who is directly affected" },
    { key: "currentLaw", label: "The law today" },
    { key: "kind", label: "Type of change" },
  ],
  office: [
    { key: "duties", label: "What the office does" },
    { key: "term", label: "Term" },
    { key: "seats", label: "Seats" },
    { key: "salary", label: "Salary" },
  ],
  retention: [
    { key: "bio", label: "Bio" },
    { key: "currentRole", label: "Current role" },
    { key: "education", label: "Education" },
    { key: "pastPositions", label: "Past positions" },
  ],
  candidate: [
    { key: "bio", label: "Bio" },
    { key: "currentRole", label: "Current role" },
    { key: "education", label: "Education" },
    { key: "pastPositions", label: "Past positions" },
    { key: "platform", label: "Platform" },
  ],
};

function linesFor(p: Payload, field: string): Line[] {
  const ref = (x: { quote: string; source: string }): Ref => ({ quote: x.quote, source: p.sources[x.source] });
  const one = (a?: StoredAnswer) => (a ? [{ text: a.text, refs: [ref(a)] }] : []);
  if (p.kind === "measure" || p.kind === "office") return one((p.answers as Record<string, StoredAnswer | undefined>)[field]);
  if (p.v !== 2) return []; // superseded shape from the first pass
  if (field === "bio") {
    const facts = new Map<string, { quote: string; source: string }>([
      ...p.positions.map((x, i) => [`P${i}`, x] as const),
      ...p.education.map((x, i) => [`E${i}`, x] as const),
      ...(p.residence ? [["R", p.residence] as const] : []),
    ]);
    return p.bio.map((s) => ({ text: s.text, refs: s.facts.map((id) => facts.get(id)).filter((x): x is { quote: string; source: string } => !!x).map(ref) }));
  }
  if (field === "currentRole") {
    const c = p.positions.find((x) => x.endYear === "present");
    return c ? [{ text: [c.title, c.organization].filter(Boolean).join(", "), refs: [ref(c)] }] : [];
  }
  if (field === "education") return p.education.map((e) => ({ text: educationLine(e), refs: [ref(e)] }));
  if (field === "pastPositions") return p.positions.map((x) => ({ text: positionLine(x), refs: [ref(x)], sub: x.committees?.length ? `Committees: ${x.committees.join(", ")}` : undefined }));
  if (field === "platform") return p.platform.map((x) => ({ text: x.text, refs: [ref(x)] }));
  return [];
}

const norm = (lines: Line[]) => lines.map((l) => l.text.replace(/<\/?mark>/g, "").toLowerCase().replace(/[^a-z0-9%$]+/g, " ").trim()).join("|");

export function buildComparison(targets: CompareTarget[], settings: Setting[], cells: Map<string, CellInput>): { items: Item[]; summary: SettingSummary[] } {
  const ids = settings.map(settingId);
  const summary = new Map<string, SettingSummary>(
    ids.map((s) => [s, { setting: s, items: targets.length, done: 0, costMicroUsd: 0, avgSeconds: null, kept: 0, rejectedByReason: {}, blank: 0, cachedShare: null }]),
  );
  const secs = new Map<string, number[]>(ids.map((s) => [s, []]));
  const tokens = new Map<string, { all: number; cached: number }>(ids.map((s) => [s, { all: 0, cached: 0 }]));
  const items: Item[] = targets.map((target) => {
    const fields = FIELDS[target.kind];
    const row: Cell[] = ids.map((setting) => {
      const input = cells.get(`${target.key}@${setting}`);
      const sum = summary.get(setting)!;
      const out: Cell = { setting, status: "pending", outcome: input?.outcome ?? null, fields: {}, rejected: [], leftOut: [], conflicts: [], tried: [], costMicroUsd: 0 };
      if (input?.payload) {
        out.status = "done";
        sum.done++;
        for (const f of fields) {
          out.fields[f.key] = linesFor(input.payload, f.key);
          if (out.fields[f.key].length) sum.kept += out.fields[f.key].length;
          else sum.blank++;
        }
      } else if (input?.outcome === "no documents") out.status = "no documents";
      else if (input?.outcome === "failed") out.status = "failed";
      else if (input?.outcome && !["waiting", "rate limited"].includes(input.outcome)) out.status = "other";
      if (input?.run) {
        out.rejected = input.run.rejected ?? [];
        out.leftOut = input.run.leftOut ?? [];
        out.conflicts = input.run.conflicts ?? [];
        out.tried = input.run.tried ?? [];
        out.costMicroUsd = input.run.costMicroUsd ?? 0;
        out.seconds = input.run.seconds;
        sum.costMicroUsd += out.costMicroUsd;
        if (typeof out.seconds === "number") secs.get(setting)!.push(out.seconds);
        const u = input.run.usage;
        if (u) {
          const t = tokens.get(setting)!;
          const cached = u.cache_read_input_tokens ?? 0;
          t.cached += cached;
          t.all += (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0);
        }
        for (const r of out.rejected) sum.rejectedByReason[r.reason] = (sum.rejectedByReason[r.reason] ?? 0) + 1;
      }
      return out;
    });
    const done = row.filter((c) => c.status === "done");
    const differing = fields.filter((f) => new Set(done.map((c) => norm(c.fields[f.key] ?? []))).size > 1).map((f) => f.key);
    return { target, fields, cells: row, differing };
  });
  for (const [s, t] of tokens) if (t.all) summary.get(s)!.cachedShare = Math.round((t.cached / t.all) * 100) / 100;
  for (const [s, list] of secs) if (list.length) summary.get(s)!.avgSeconds = Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
  return { items, summary: [...summary.values()] };
}

const MODEL_NAMES: Record<string, string> = { "claude-haiku-5-5": "Haiku", "claude-sonnet-5-5": "Sonnet", "claude-opus-5-5": "Opus" };

/** "claude-haiku-5-5:low" → "Haiku · low". */
export function settingLabel(id: string): string {
  const [model, effort] = id.split(":");
  return `${MODEL_NAMES[model] ?? model} · ${effort}`;
}

/** Split a comparison target key ("measure:<id>:measure") into its synthesized_field_versions coordinates. */
export function coordinates(key: string): { targetType: string; targetId: string; field: string } {
  const first = key.indexOf(":");
  const last = key.lastIndexOf(":");
  return { targetType: key.slice(0, first), targetId: key.slice(first + 1, last), field: key.slice(last + 1) };
}
