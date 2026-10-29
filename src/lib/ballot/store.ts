/**
 * Persistence for address-free resolutions + privacy-safe metrics.
 *
 * Supabase in deployed environments (service role; these tables have no
 * public RLS policies). In-memory for local fixture mode so the full flow
 * runs without credentials. See docs/architecture/PRIVACY.md §4, §6.
 */
import "server-only";
import type { ResolvedBallot } from "@/domain/ballot";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export interface ResolutionEvent {
  electionId?: string;
  provider: string;
  status: string;
  latencyMs: number;
  contestCount: number;
  state?: string;
  warningCodes: string[];
}

export interface BallotStore {
  save(key: string, ballot: ResolvedBallot): Promise<void>;
  /** Returns the stored ballot, or null if absent. Expiry is the caller's check. */
  load(key: string): Promise<ResolvedBallot | null>;
  recordEvent(e: ResolutionEvent): Promise<void>;
}

export class SupabaseBallotStore implements BallotStore {
  async save(key: string, ballot: ResolvedBallot): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("ballot_resolutions")
      .upsert({
        ballot_key: key,
        election_id: ballot.election!.id,
        provider: ballot.provider,
        status: ballot.status,
        ballot: ballot as unknown as Json,
        location: ballot.location as unknown as Json,
        retrieved_at: ballot.retrievedAt,
        expires_at: ballot.expiresAt,
      });
    if (error) throw new Error(`ballot_resolutions upsert failed: ${error.message}`);
  }

  async load(key: string): Promise<ResolvedBallot | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("ballot_resolutions")
      .select("ballot")
      .eq("ballot_key", key)
      .maybeSingle();
    if (error) throw new Error(`ballot_resolutions read failed: ${error.message}`);
    return (data?.ballot as unknown as ResolvedBallot) ?? null;
  }

  async recordEvent(e: ResolutionEvent): Promise<void> {
    // Metrics must never break a voter's lookup.
    const { error } = await getSupabaseAdmin().from("resolution_events").insert({
      election_id: e.electionId ?? null,
      provider: e.provider,
      status: e.status,
      latency_ms: e.latencyMs,
      contest_count: e.contestCount,
      state: e.state ?? null,
      warning_codes: e.warningCodes,
    });
    if (error) logEvent("metrics.write_failed", { message: error.message });
  }
}

/** Process-local store for fixture mode / tests. Not for deployed use. */
export class MemoryBallotStore implements BallotStore {
  private readonly ballots = new Map<string, ResolvedBallot>();
  readonly events: ResolutionEvent[] = [];

  async save(key: string, ballot: ResolvedBallot) {
    this.ballots.set(key, structuredClone(ballot));
  }
  async load(key: string) {
    return this.ballots.get(key) ?? null;
  }
  async recordEvent(e: ResolutionEvent) {
    this.events.push(e);
    logEvent("ballot.resolution", { ...e, warningCodes: e.warningCodes.join(",") });
  }
}
