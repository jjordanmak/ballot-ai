/**
 * Pure row → page mapping for the deprecated June 2, 2026 CA primary
 * prototype (formerly src/lib/db/getBallot.ts). Used only by
 * scripts/snapshot-deprecated.ts to rebuild the frozen snapshot from an
 * export of the June tables; the pages themselves never read the database.
 */
import type { Candidate, Endorsement, Issue, IssuePosition, NewsItem, Party, Race } from "../../src/data/types";

export interface DbRace {
  id: string;
  office: string;
  jurisdiction_label: string;
  format: string;
  format_explainer: string;
  scope_type: "statewide" | "district" | "county";
  scope_value: string | null;
  unopposed: boolean;
  meta: unknown;
  intro: unknown;
  issues: unknown;
  sort_order: number;
}

export interface DbCandidate {
  id: string;
  race_id: string;
  name: string;
  party: string;
  headshot_url: string | null;
  major: boolean;
  polling_status: string;
  polling_pct: number | null;
  trend: string | null;
  campaign_suspended: unknown;
  withdrawn: boolean;
  current_position: string;
  past_roles: unknown;
  background: string;
  priorities: unknown;
  stances: unknown;
  strengths: unknown;
  criticisms: unknown;
  history: unknown;
  vote_for_if: unknown;
  bottom_line: string;
  issues: unknown;
  sort_order: number;
}

export interface DbEndorsement {
  candidate_id: string;
  category: string;
  name: string;
  sort_order: number;
}

export interface DbNewsItem {
  id: string;
  race_id: string | null;
  candidate_id: string | null;
  type: string;
  source: string;
  title: string;
  excerpt: string | null;
  url: string | null;
  published_at: string;
  social: unknown;
}


export interface JuneRows {
  races: DbRace[];
  candidates: DbCandidate[];
  endorsements: DbEndorsement[];
  news: DbNewsItem[];
}

/** The races on the ballot for these districts, with candidates, endorsements and news attached. */
export function buildBallot(rows: JuneRows, districts: Record<string, string | number | undefined>): Race[] {
  const onBallot = [...rows.races].sort((a, b) => a.sort_order - b.sort_order).filter((r) => raceIsOnBallot(r, districts));
  const raceIds = new Set(onBallot.map((r) => r.id));
  const candidates = rows.candidates.filter((c) => raceIds.has(c.race_id)).sort((a, b) => a.sort_order - b.sort_order);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const group = <T,>(items: T[], key: (t: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const it of items) {
      const k = key(it);
      if (k) m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  };
  const endorsements = group(
    rows.endorsements.filter((e) => candidateIds.has(e.candidate_id)).sort((a, b) => a.sort_order - b.sort_order),
    (e) => e.candidate_id,
  );
  const news = [...rows.news].sort((a, b) => b.published_at.localeCompare(a.published_at));
  const newsByCandidate = group(news.filter((n) => n.candidate_id && candidateIds.has(n.candidate_id)), (n) => n.candidate_id);
  const newsByRace = group(news.filter((n) => !n.candidate_id && n.race_id && raceIds.has(n.race_id)), (n) => n.race_id);
  const byRace = group(candidates, (c) => c.race_id);

  return onBallot.map((race) => ({
    id: race.id,
    office: race.office,
    jurisdiction: race.jurisdiction_label,
    format: race.format,
    formatExplainer: race.format_explainer,
    meta: race.meta as Race["meta"],
    unopposed: race.unopposed,
    intro: race.intro as Race["intro"],
    issues: race.issues as Issue[],
    candidates: (byRace.get(race.id) ?? []).map((c) => mapCandidate(c, endorsements.get(c.id) ?? [], newsByCandidate.get(c.id) ?? [])),
    news: (newsByRace.get(race.id) ?? []).map(mapNewsItem),
  }));
}

/* ─── Mappers (DB row → UI type) ─────────────────────────────────── */

function mapCandidate(c: DbCandidate, endorsements: DbEndorsement[], news: DbNewsItem[]): Candidate {
  return {
    id: c.id.split("__").pop() ?? c.id,    // un-namespace for component use
    name: c.name,
    party: c.party as Party,
    headshot: c.headshot_url ?? undefined,
    major: c.major,
    pollingStatus: c.polling_status,
    pollingPct: c.polling_pct ?? undefined,
    trend: (c.trend ?? undefined) as Candidate["trend"],
    campaignSuspended: c.campaign_suspended as Candidate["campaignSuspended"],
    withdrawn: c.withdrawn,
    currentRole: c.current_position,
    pastRoles: (c.past_roles ?? []) as string[],
    background: c.background,
    priorities: (c.priorities ?? []) as string[],
    stances: (c.stances ?? []) as string[],
    strengths: (c.strengths ?? []) as string[],
    criticisms: (c.criticisms ?? []) as string[],
    history: (c.history ?? []) as Candidate["history"],
    voteForIf: (c.vote_for_if ?? []) as string[],
    bottomLine: c.bottom_line,
    issues: (c.issues ?? {}) as Record<string, IssuePosition>,
    endorsements: endorsements.map(
      (e): Endorsement => ({
        category: e.category as Endorsement["category"],
        name: e.name,
      })
    ),
    news: news.map(mapNewsItem),
  };
}

function mapNewsItem(n: DbNewsItem): NewsItem {
  return {
    id: n.id,
    type: n.type as NewsItem["type"],
    source: n.source,
    title: n.title,
    excerpt: n.excerpt ?? undefined,
    url: n.url ?? undefined,
    date: n.published_at,
    social: (n.social ?? undefined) as NewsItem["social"],
  };
}

/* ─── Ballot filtering ────────────────────────────────────────────── */

/**
 * A race appears on a voter's ballot when its scope matches their
 * jurisdiction:
 *   statewide → always
 *   district  → scope_value matches a district code in jurisdiction.districts
 *   county    → scope_value matches the county code (or 'SMC', etc.)
 */
function raceIsOnBallot(
  race: DbRace,
  districts: Record<string, string | number | undefined>
): boolean {
  if (race.scope_type === "statewide") return true;

  if (race.scope_type === "district") {
    if (!race.scope_value) return false;
    const v = race.scope_value.toUpperCase();
    if (v.startsWith("CA-") && districts.us_house != null && `CA-${districts.us_house}` === v) return true;
    if (v.startsWith("AD-") && districts.state_assembly != null && `AD-${districts.state_assembly}` === v) return true;
    if (v.startsWith("SD-") && districts.state_senate != null && `SD-${districts.state_senate}` === v) return true;
    if (v.startsWith("BOE-") && districts.boe != null && `BOE-${districts.boe}` === v) return true;
    return false;
  }

  if (race.scope_type === "county") {
    // For now: treat any county-scoped race with scope_value 'SMC' as on
    // the ballot when the jurisdiction's county is 'San Mateo'. The full
    // version will use canonical county codes.
    if (race.scope_value === "SMC" && districts.county === "San Mateo") return true;
    return false;
  }

  return false;
}
