/**
 * Which election is a lookup for, and what does each provider call it?
 *
 * Elections are data (the `elections` table). Provider ids are discovered,
 * never assumed: Google Civic's id comes from `/elections`, matched by date,
 * unless the row's external_ids or GOOGLE_CIVIC_ELECTION_ID pins it.
 */
import "server-only";
import type { ElectionRef, ResolutionStatus } from "@/domain/ballot";
import { GoogleCivicElectionProvider, matchProviderElection } from "@/lib/providers/google-civic/resolver";
import type { ElectionProvider } from "@/lib/providers/types";
import { FIXTURE_ELECTION } from "./fixtureElection";
import { supabaseServer } from "@/lib/supabase/server";
import { electionToday } from "@/domain/electionDay";

export { FIXTURE_ELECTION };

export type ElectionLookup =
  | { ok: true; election: ElectionRef }
  | { ok: false; status: ResolutionStatus; detail: string };

export interface ElectionSource {
  current(): Promise<ElectionLookup>;
  bySlug(slug: string): Promise<ElectionRef | null>;
}

interface ElectionRow {
  id: string;
  slug: string | null;
  name: string;
  date: string;
  external_ids: unknown;
}

function toRef(row: ElectionRow): ElectionRef {
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    name: row.name,
    date: row.date.slice(0, 10),
    externalIds: (row.external_ids ?? {}) as ElectionRef["externalIds"],
  };
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export class SupabaseElectionSource implements ElectionSource {
  private cache: { at: number; lookup: ElectionLookup } | null = null;

  constructor(
    private readonly civic: ElectionProvider = new GoogleCivicElectionProvider(),
    private readonly today: () => string = () => electionToday(),
  ) {}

  async current(): Promise<ElectionLookup> {
    if (this.cache && Date.now() - this.cache.at < DISCOVERY_TTL_MS) return this.cache.lookup;

    const { data, error } = await supabaseServer
      .from("elections")
      .select("id, slug, name, date, external_ids")
      .neq("status", "archived")
      .gte("date", this.today())
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, status: "PROVIDER_ERROR", detail: `elections read: ${error.message}` };
    if (!data) return { ok: false, status: "ELECTION_NOT_FOUND", detail: "no upcoming election configured" };

    const election = toRef(data);
    const lookup = await this.withCivicId(election);
    // Only cache successes; failures retry on the next request.
    if (lookup.ok) this.cache = { at: Date.now(), lookup };
    return lookup;
  }

  async bySlug(slug: string): Promise<ElectionRef | null> {
    const { data, error } = await supabaseServer
      .from("elections")
      .select("id, slug, name, date, external_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`elections read: ${error.message}`);
    return data ? toRef(data) : null;
  }

  private async withCivicId(election: ElectionRef): Promise<ElectionLookup> {
    if (election.externalIds["google-civic"]) return { ok: true, election };
    const res = await this.civic.getElections();
    if (!res.ok) return { ok: false, status: res.kind, detail: `civic /elections: ${res.detail}` };
    const match = matchProviderElection(res.value, election.date, process.env.GOOGLE_CIVIC_ELECTION_ID || undefined);
    if (!match) {
      return { ok: false, status: "ELECTION_NOT_FOUND", detail: `no Civic election on ${election.date}` };
    }
    return { ok: true, election: { ...election, externalIds: { ...election.externalIds, "google-civic": match.externalId } } };
  }
}

export class FixtureElectionSource implements ElectionSource {
  async current(): Promise<ElectionLookup> {
    return { ok: true, election: FIXTURE_ELECTION };
  }
  async bySlug(slug: string) {
    return slug === FIXTURE_ELECTION.slug ? FIXTURE_ELECTION : null;
  }
}
