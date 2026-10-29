/**
 * What the research pipeline works on, and where it may look. Targets come
 * from the durable registry (contests seen on looked-up ballots); URLs come
 * only from that registry (a candidate's campaign site from the ballot data)
 * and the per-state official-guides list. Nothing is searched for.
 */
import guides from "@/data/sources/official-guides.json";
import { STATE_NAMES } from "@/domain/categorize";
import { readableName } from "@/domain/text";

export type TargetKind = "measure" | "retention" | "candidate";

export interface Target {
  kind: TargetKind;
  /** synthesized_field_versions.target_type / target_id / field_name */
  targetType: "measure" | "candidate";
  targetId: string;
  field: "measure" | "profile";
  /** Shown to the model: stored entity data only. */
  label: string;
  state?: string;
  /** Pages to read first, and link texts on them to follow. */
  pages: { url: string; official: boolean; publisher?: string }[];
  follow: string[];
  /** For people: the name to look for in the documents. */
  personName?: string;
  office?: string;
  division?: string;
}

export interface ContestRow {
  id: string;
  kind: string;
  contest_type: string | null;
  title: string;
  division_key: string;
  divisions: { name: string; state: string | null; scope: string | null } | null;
  contest_candidates: { id: string; ballot_name: string; display_name: string | null; campaign_url: string | null }[];
}

interface StateGuide {
  publisher: string;
  statewideMeasure?: { pages: string[]; follow: string[] };
  retention?: { match: string; url: string }[];
}

const GUIDES = (guides as { states: Record<string, StateGuide> }).states;

/** Campaign pages most likely to hold a bio or stated priorities. */
export const CAMPAIGN_FOLLOW = ["about", "meet", "bio", "biography", "issues", "priorities", "platform", "vision", "agenda"];

const isStatewideKey = (key: string, scope: string | null) =>
  scope === "statewide" || /^ocd-division\/country:us\/(state:[a-z]{2}|district:dc)$/.test(key);

/** "Proposition 50", "Measure 2", "Issue 1", "Amendment 3", "Question 4" → "50". */
export function measureNumber(title: string): string | undefined {
  return /\b(?:proposition|prop\.?|measure|issue|amendment|question|initiative|referendum)\s+(?:no\.?\s*)?(\d+[a-z]?)\b/i.exec(title)?.[1];
}

export function buildTargets(rows: ContestRow[]): Target[] {
  const out: Target[] = [];
  for (const c of rows) {
    const div = c.divisions;
    const state = div?.state?.toUpperCase() ?? undefined;
    const guide = state ? GUIDES[state] : undefined;
    const where = [...new Set([div?.name, state ? STATE_NAMES[state] : undefined].filter(Boolean))].join(", ");

    if (c.kind === "measure") {
      const n = measureNumber(c.title);
      const sw = guide?.statewideMeasure;
      if (!n || !sw || !isStatewideKey(c.division_key, div?.scope ?? null)) continue; // local measures: no official list yet
      out.push({
        kind: "measure",
        targetType: "measure",
        targetId: c.id,
        field: "measure",
        label: `${c.title} (${where})`,
        state,
        pages: sw.pages.map((p) => ({ url: p.replace("{number}", encodeURIComponent(n)), official: true, publisher: guide!.publisher })),
        follow: sw.follow,
      });
      continue;
    }

    const retention = c.contest_type === "retention" && c.contest_candidates.length === 1;
    for (const k of c.contest_candidates) {
      const name = k.display_name || readableName(k.ballot_name);
      if (retention) {
        const page = guide?.retention?.find((r) => new RegExp(r.match, "i").test(`${c.title} ${div?.name ?? ""}`));
        if (!page) continue;
        out.push({
          kind: "retention",
          targetType: "candidate",
          targetId: k.id,
          field: "profile",
          label: `${name}, ${c.title} (${where})`,
          state,
          pages: [{ url: page.url, official: true, publisher: guide!.publisher }],
          follow: [],
          personName: name,
          office: c.title,
          division: where,
        });
      } else if (k.campaign_url && /^https?:\/\//i.test(k.campaign_url)) {
        out.push({
          kind: "candidate",
          targetType: "candidate",
          targetId: k.id,
          field: "profile",
          label: `${name}, candidate for ${c.title} (${where})`,
          state,
          pages: [{ url: k.campaign_url, official: false }],
          follow: CAMPAIGN_FOLLOW,
          personName: name,
          office: c.title,
          division: where,
        });
      }
    }
  }
  // Statewide measures first (one answer serves a whole state), then judges, then candidates.
  const order: Record<TargetKind, number> = { measure: 0, retention: 1, candidate: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The instruction for one target. Built from stored entities only (never request data). */
export function taskFor(t: Target): string {
  if (t.kind === "measure") {
    return `Measure: ${t.label}.\nAnswer each question about this measure only, from the documents. For "kind", say what type of measure it is (for example constitutional amendment, statute, bond) and who placed it on the ballot.`;
  }
  if (t.kind === "retention") {
    return `Judge: ${t.personName}, ${t.office} (${t.division}), on the ballot for a retention vote (Yes/No on whether to keep this judge).\nThe documents may describe several judges: use only passages about ${t.personName}. Give their current role, background and past positions. Leave "priorities" empty.`;
  }
  return `Candidate: ${t.personName}, running for ${t.office} (${t.division}).\nThe documents are the candidate's own campaign website. Extract facts about this person only: current role, background, past positions, and up to five priorities they state (attribute each: "Says they will…").`;
}
