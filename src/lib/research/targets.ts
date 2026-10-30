/**
 * What the research job works on, and where it may look (owner,
 * 2026-10-29). Targets come from the durable registry (contests seen on
 * looked-up ballots). Sources, the same kinds for everyone of a kind:
 *
 * - measures: official only: the state guide, the county's official
 *   election page and its PDFs, and `.gov` search. Never Ballotpedia
 *   (CLAUDE.md: measure answers come from official analyses only);
 * - judges and candidates: their official statement (state guide or
 *   county), `.gov` pages and their Ballotpedia page (both by search), and
 *   their campaign site when an official filing or Ballotpedia links it;
 * - "what this office does": `.gov` pages by search;
 * - race intros (one per candidate contest): `.gov` pages, vetted news and
 *   the race's Ballotpedia page, by search.
 *
 * Pure: no I/O. The job fetches; this only says where to look.
 */
import guides from "@/data/sources/official-guides.json";
import { STATE_NAMES } from "@/domain/categorize";
import { splitMapYear } from "@/domain/districtMaps";
import type { EnrichmentBundle } from "@/domain/enrichment";
import { normalizeForMatch, readableName } from "@/domain/text";
import type { SearchKind } from "./search";

export type TargetKind = "measure" | "retention" | "candidate" | "race" | "office";

export interface TargetPage {
  url: string;
  official: boolean;
  publisher?: string;
  /** PDFs are read only from official election sites. */
  allowPdf?: boolean;
}

export interface Target {
  /** research_state key (plus "@model:effort" in compare mode). */
  key: string;
  kind: TargetKind;
  /** synthesized_field_versions.target_type / target_id / field_name */
  targetType: "measure" | "candidate" | "contest" | "race";
  targetId: string;
  field: "measure" | "profile" | "office" | "race";
  /** Shown to the model: stored entity data only. */
  label: string;
  state?: string;
  pages: TargetPage[];
  /** Link texts on those pages to follow (same site only). */
  follow: string[];
  search?: { kind: SearchKind; query: string; mustMention?: string[] };
  /** Terms that locate this target inside long documents (county guides). */
  focus: string[];
  personName?: string;
  office?: string;
  division?: string;
  /** County, city, school or special-district race (residence is shown only for these). */
  local?: boolean;
  /** The party as the ballot prints it (people): one of the item's own names in the writing checks. */
  party?: string;
  /** Race intros: the candidates' target ids (the fairness pass reads their results) and names. */
  candidateIds?: string[];
  candidateNames?: string[];
}

export interface ContestRow {
  id: string;
  kind: string;
  contest_type: string | null;
  title: string;
  division_key: string;
  divisions: { name: string; state: string | null; scope: string | null } | null;
  contest_candidates: { id: string; ballot_name: string; display_name: string | null; campaign_url: string | null; party?: string | null }[];
}

interface CountyGuide {
  name: string;
  publisher: string;
  divisions: string;
  page: string;
  follow: string[];
}

interface StateGuide {
  publisher: string;
  statewideMeasure?: { pages: string[]; follow: string[] };
  retention?: { match: string; url: string }[];
  candidateStatements?: { match: string; url: string }[];
  officialPdfHosts?: string[];
  counties?: CountyGuide[];
}

const GUIDES = (guides as unknown as { states: Record<string, StateGuide> }).states;

/** Campaign pages most likely to hold a bio or stated priorities. */
export const CAMPAIGN_FOLLOW = ["about", "meet", "bio", "biography", "issues", "priorities", "platform", "vision", "agenda"];

const isStatewideKey = (key: string, scope: string | null) =>
  scope === "statewide" || /^ocd-division\/country:us\/(state:[a-z]{2}|district:dc)$/.test(key);

/** "Proposition 50", "Measure 2", "Issue 1", "Amendment 3", "Question 4" → "50". */
export function measureNumber(title: string): string | undefined {
  return /\b(?:proposition|prop\.?|measure|issue|amendment|question|initiative|referendum)\s+(?:no\.?\s*)?(\d+[a-z]?)\b/i.exec(title)?.[1];
}

/** "Measure Z", "Proposition 50" → the identifying phrase, for finding it in long documents. */
const measureLabel = (title: string) => /\b(proposition|prop\.?|measure|issue|amendment|question)\s+[a-z0-9]{1,4}\b/i.exec(title)?.[0];

export function countyFor(state: string | undefined, divisionName: string): CountyGuide | undefined {
  const g = state ? GUIDES[state.toUpperCase()] : undefined;
  return g?.counties?.find((c) => new RegExp(c.divisions, "i").test(divisionName));
}

const pdfHostOk = (state: string | undefined, url: string) => {
  const hosts = (state && GUIDES[state.toUpperCase()]?.officialPdfHosts) || [];
  const h = new URL(url).hostname;
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
};

/**
 * The office, without district numbers, and where it is: one description
 * serves every district of the same office ("ca|member of the state
 * assembly|california"). Same function on the ballot page and in the job.
 */
export function officeKeyFor(c: { title: string; divisionName: string; state?: string; statewideOrLegislative: boolean }): {
  key: string;
  office: string;
  jurisdiction: string;
} {
  const st = (c.state ?? "").toUpperCase();
  const office = c.title
    .replace(/\((short|full|unexpired) term\)/gi, " ")
    .replace(/,?\s*(district|division|trustee area|seat|area|no\.?)\s+(\d+[a-z]?|[ivx]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, " ")
    .replace(/\b\d+(st|nd|rd|th)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,]+$/, "")
    .trim();
  const county = countyFor(st, c.divisionName);
  const jurisdiction = c.statewideOrLegislative
    ? STATE_NAMES[st] ?? st
    : county && !/city of|school|college|union|unified|trustee/i.test(c.divisionName)
      ? county.name
      : splitMapYear(c.divisionName).name.replace(/\b\d+(st|nd|rd|th)\b|\b(trustee area|district)\s+\d+\b/gi, " ").replace(/\s+/g, " ").trim();
  return { key: `${st.toLowerCase()}|${normalizeForMatch(office)}|${normalizeForMatch(jurisdiction)}`, office, jurisdiction };
}

const LEGISLATIVE = /assembly|state senate|senator|representative|congress|house of delegates|legislature/i;

/** Curated campaign links (from official filings), keyed like the enrichment bundle. */
function curatedCampaign(bundle: EnrichmentBundle | undefined, divisionName: string, title: string, ballotName: string): string | undefined {
  const key = `${normalizeForMatch(divisionName)}|${normalizeForMatch(title)}::${normalizeForMatch(ballotName)}`;
  return bundle?.candidates?.[key]?.links?.find((l) => l.kind === "campaign")?.url;
}

export function buildTargets(rows: ContestRow[], bundle?: EnrichmentBundle): Target[] {
  const out: Target[] = [];
  const offices = new Map<string, Target>();
  for (const c of rows) {
    const div = c.divisions;
    const divisionName = div?.name ?? "";
    const state = div?.state?.toUpperCase() ?? undefined;
    const stateName = state ? STATE_NAMES[state] ?? state : "";
    const guide = state ? GUIDES[state] : undefined;
    const county = countyFor(state, divisionName);
    const where = [...new Set([splitMapYear(divisionName).name, stateName].filter(Boolean))].join(", ");
    const statewide = isStatewideKey(c.division_key, div?.scope ?? null);
    const countyPage = (): TargetPage[] => (county ? [{ url: county.page, official: true, publisher: county.publisher, allowPdf: true }] : []);

    if (c.kind === "measure") {
      const n = measureNumber(c.title);
      const label = measureLabel(c.title) ?? c.title;
      const sw = statewide && n ? guide?.statewideMeasure : undefined;
      const pages: TargetPage[] = sw
        ? sw.pages.map((p) => ({ url: p.replace("{number}", encodeURIComponent(n!)), official: true, publisher: guide!.publisher, allowPdf: true }))
        : countyPage();
      out.push({
        key: `measure:${c.id}:measure`,
        kind: "measure",
        targetType: "measure",
        targetId: c.id,
        field: "measure",
        label: `${c.title} (${where})`,
        state,
        pages,
        follow: sw ? sw.follow : county?.follow ?? [],
        // Local measures also look for the official analysis on .gov sites.
        search: sw ? undefined : { kind: "measure", query: `${label} ${where} ${c.title !== label ? c.title : ""} full text impartial analysis`.trim() },
        focus: [label, ...(c.title !== label ? [c.title] : [])],
      });
      continue;
    }

    // What this office does: one per office type and place.
    const ok = officeKeyFor({ title: c.title, divisionName, state, statewideOrLegislative: statewide || LEGISLATIVE.test(c.title) });
    if (!offices.has(ok.key)) {
      offices.set(ok.key, {
        key: `contest:${ok.key}:office`,
        kind: "office",
        targetType: "contest",
        targetId: ok.key,
        field: "office",
        label: `${ok.office} (${ok.jurisdiction})`,
        state,
        pages: [],
        follow: [],
        search: { kind: "office", query: `${ok.office} ${ok.jurisdiction === stateName ? "" : ok.jurisdiction} ${stateName} duties term of office`.replace(/\s+/g, " ") },
        focus: [ok.office],
        office: ok.office,
        division: ok.jurisdiction,
      });
    }

    const retention = c.contest_type === "retention" && c.contest_candidates.length === 1;
    const names = c.contest_candidates.map((k) => k.display_name || readableName(k.ballot_name));
    if (!retention && c.contest_candidates.length) {
      out.push({
        key: `race:${c.id}:race`,
        kind: "race",
        targetType: "race",
        targetId: c.id,
        field: "race",
        label: `${c.title} (${where})`,
        state,
        pages: [],
        follow: [],
        search: { kind: "race", query: `${c.title} ${where} 2026 election`.replace(/\s+/g, " ") },
        focus: [c.title, ok.office],
        office: c.title,
        division: where,
        local: !statewide && !LEGISLATIVE.test(c.title),
        candidateIds: c.contest_candidates.map((k) => k.id),
        candidateNames: names,
      });
    }
    for (const k of c.contest_candidates) {
      const name = k.display_name || readableName(k.ballot_name);
      const last = name.split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).pop() ?? name;
      const pages: TargetPage[] = [];
      if (retention) {
        const page = guide?.retention?.find((r) => new RegExp(r.match, "i").test(`${c.title} ${divisionName}`));
        if (page) pages.push({ url: page.url, official: true, publisher: guide!.publisher });
      } else {
        const stmt = guide?.candidateStatements?.find((s) => new RegExp(s.match, "i").test(normalizeForMatch(c.title)));
        if (stmt && statewide) pages.push({ url: stmt.url, official: true, publisher: guide!.publisher });
        else pages.push(...countyPage());
        const campaign = k.campaign_url ?? curatedCampaign(bundle, divisionName, c.title, k.ballot_name);
        if (campaign && /^https?:\/\//i.test(campaign)) pages.push({ url: campaign, official: false });
      }
      out.push({
        key: `candidate:${k.id}:profile`,
        kind: retention ? "retention" : "candidate",
        targetType: "candidate",
        targetId: k.id,
        field: "profile",
        label: retention ? `${name}, ${c.title} (${where})` : `${name}, candidate for ${c.title} (${where})`,
        state,
        pages,
        follow: CAMPAIGN_FOLLOW,
        search: { kind: "person", query: `${name} ${c.title} ${where}`, mustMention: [last] },
        focus: [name, last],
        personName: name,
        office: c.title,
        division: where,
        local: !retention && !statewide && !LEGISLATIVE.test(c.title),
        ...(k.party ? { party: k.party } : {}),
      });
    }
  }
  // Statewide measures first (one answer serves a whole state), then judges, candidates, races (they wait for their candidates), offices.
  const order: Record<TargetKind, number> = { measure: 0, retention: 1, candidate: 2, race: 3, office: 4 };
  return [...out, ...offices.values()].sort((a, b) => order[a.kind] - order[b.kind]);
}

export { researchTask as taskFor, synthesisTask } from "@/lib/ai/prompts";

export { pdfHostOk };
