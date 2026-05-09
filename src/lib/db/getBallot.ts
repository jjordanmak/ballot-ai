/**
 * Server-side fetcher: load a voter's ballot from Supabase.
 *
 * Given (zip, electionId), returns the array of Race objects in the shape
 * the existing UI components expect (camelCase, nested candidates / news /
 * endorsements). Filtering by jurisdiction happens here so the components
 * never see a race that's not on the user's ballot.
 *
 * The DB ↔ TS conversion lives here in one place; if you change a column,
 * change the mapper.
 */

import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Race,
  Candidate,
  Issue,
  IssuePosition,
  Endorsement,
  NewsItem,
  Party,
} from "@/data/types";

/* ─── Types: the raw DB rows we'll work with ─────────────────────── */

interface DbRace {
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

interface DbCandidate {
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

interface DbEndorsement {
  candidate_id: string;
  category: string;
  name: string;
  sort_order: number;
}

interface DbNewsItem {
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

/* ─── Fetcher ─────────────────────────────────────────────────────── */

/**
 * Load every race for the given ZIP + election, with all child data
 * embedded in a single typed array. SSR-safe.
 *
 * Uses 4 parallel reads (races, candidates, endorsements, news) instead
 * of a single deeply-nested query, because Supabase's PostgREST
 * embedding is more brittle than this approach when there are dozens
 * of rows and JSONB is involved. Total round-trips: 1 (in parallel).
 */
export async function getBallot(zip: string, electionId: string): Promise<Race[]> {
  // Resolve jurisdiction → districts so we can filter races for the ballot.
  const { data: jurisdiction, error: jErr } = await supabaseServer
    .from("jurisdictions")
    .select("districts")
    .eq("zip", zip)
    .single();

  if (jErr || !jurisdiction) {
    throw new Error(`No jurisdiction found for ZIP ${zip}: ${jErr?.message ?? "not found"}`);
  }

  const districts = (jurisdiction.districts ?? {}) as Record<string, string | number | undefined>;

  // Fetch races first so all child queries can be scoped to this ballot
  // instead of reading every candidate/news row in the database.
  const racesRes = await supabaseServer
    .from("races")
    .select("*")
    .eq("election_id", electionId)
    .order("sort_order", { ascending: true });
  if (racesRes.error) throw racesRes.error;

  const allRaces = (racesRes.data ?? []) as DbRace[];
  const onBallot = allRaces.filter((r) => raceIsOnBallot(r, districts));
  const raceIds = onBallot.map((r) => r.id);

  if (raceIds.length === 0) return [];

  const candidatesRes = await supabaseServer
    .from("candidates")
    .select("*")
    .in("race_id", raceIds)
    .order("sort_order", { ascending: true });
  if (candidatesRes.error) throw candidatesRes.error;

  const allCandidates = (candidatesRes.data ?? []) as DbCandidate[];
  const candidateIds = allCandidates.map((c) => c.id);

  const [endorsementsRes, newsRes] = await Promise.all([
    candidateIds.length > 0
      ? supabaseServer
          .from("endorsements")
          .select("*")
          .in("candidate_id", candidateIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabaseServer
      .from("news_items")
      .select("*")
      .or(
        candidateIds.length > 0
          ? `race_id.in.(${postgrestIn(raceIds)}),candidate_id.in.(${postgrestIn(candidateIds)})`
          : `race_id.in.(${postgrestIn(raceIds)})`
      )
      .order("published_at", { ascending: false }),
  ]);

  if (endorsementsRes.error) throw endorsementsRes.error;
  if (newsRes.error) throw newsRes.error;

  const allEndorsements = (endorsementsRes.data ?? []) as DbEndorsement[];
  const allNews = (newsRes.data ?? []) as DbNewsItem[];

  // Index candidates / endorsements / news by race_id and candidate_id
  // for O(N) assembly instead of O(N²).
  const candidatesByRace = new Map<string, DbCandidate[]>();
  for (const c of allCandidates) {
    if (!candidatesByRace.has(c.race_id)) candidatesByRace.set(c.race_id, []);
    candidatesByRace.get(c.race_id)!.push(c);
  }

  const endorsementsByCandidate = new Map<string, DbEndorsement[]>();
  for (const e of allEndorsements) {
    if (!endorsementsByCandidate.has(e.candidate_id)) endorsementsByCandidate.set(e.candidate_id, []);
    endorsementsByCandidate.get(e.candidate_id)!.push(e);
  }

  const newsByRace = new Map<string, DbNewsItem[]>();
  const newsByCandidate = new Map<string, DbNewsItem[]>();
  for (const n of allNews) {
    if (n.candidate_id) {
      if (!newsByCandidate.has(n.candidate_id)) newsByCandidate.set(n.candidate_id, []);
      newsByCandidate.get(n.candidate_id)!.push(n);
    } else if (n.race_id) {
      if (!newsByRace.has(n.race_id)) newsByRace.set(n.race_id, []);
      newsByRace.get(n.race_id)!.push(n);
    }
  }

  return onBallot.map((race) => {
    const candidates = (candidatesByRace.get(race.id) ?? []).map((c) =>
      mapCandidate(c, endorsementsByCandidate.get(c.id) ?? [], newsByCandidate.get(c.id) ?? [])
    );
    return {
      id: race.id,
      office: race.office,
      jurisdiction: race.jurisdiction_label,
      format: race.format,
      formatExplainer: race.format_explainer,
      meta: race.meta as Race["meta"],
      unopposed: race.unopposed,
      intro: race.intro as Race["intro"],
      issues: race.issues as Issue[],
      candidates,
      news: (newsByRace.get(race.id) ?? []).map(mapNewsItem),
    };
  });
}

function postgrestIn(values: string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",");
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
