/**
 * Fixture resolver for tests and UI development (BALLOT_PROVIDER=fixture).
 *
 * Serves a FICTIONAL voterinfo response through the real Civic normalizer,
 * so the UI exercises the same code path as production. Never enabled in
 * production deployments. Address keywords simulate failure states:
 *   "invalid" | "ambiguous" | "ratelimit" | "error" | "nocoverage" | "noelection"
 */
import type { ElectionRef, ResolutionStatus, ResolvedBallot } from "@/domain/ballot";
import type { AddressInput } from "../address";
import type { BallotResolver, ElectionProvider, ProviderElection, ProviderResult } from "../types";
import { normalizeVoterInfo } from "../google-civic/normalize";
import { decideStatus } from "../google-civic/status";
import type { CivicVoterInfoResponse } from "../google-civic/types";
import sample from "./sample-voterinfo.json";

const SIMULATED: [RegExp, ResolutionStatus][] = [
  [/invalid/i, "INVALID_ADDRESS"],
  [/ambiguous/i, "AMBIGUOUS_ADDRESS"],
  [/ratelimit/i, "RATE_LIMITED"],
  [/error/i, "PROVIDER_ERROR"],
  [/nocoverage/i, "NO_COVERAGE"],
  [/noelection/i, "ELECTION_NOT_FOUND"],
];

export class FixtureElectionProvider implements ElectionProvider {
  readonly id = "fixture" as const;
  async getElections(): Promise<ProviderResult<ProviderElection[]>> {
    const e = (sample as CivicVoterInfoResponse).election!;
    return {
      ok: true,
      value: [{ provider: this.id, externalId: e.id!, name: e.name!, date: e.electionDay!, ocdDivisionId: e.ocdDivisionId }],
    };
  }
}

export class FixtureBallotResolver implements BallotResolver {
  readonly id = "fixture" as const;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async resolveBallot(address: AddressInput, election: ElectionRef): Promise<ResolvedBallot> {
    const retrievedAt = this.now().toISOString();
    const expiresAt = new Date(Date.parse(retrievedAt) + 6 * 3600 * 1000).toISOString();
    const raw = address.reveal();
    for (const [re, status] of SIMULATED) {
      if (re.test(raw)) {
        // Like Civic, a no-ballot answer still names the state election office.
        const administration = normalizeVoterInfo(sample as CivicVoterInfoResponse, election, retrievedAt).administration;
        return { status, provider: this.id, election, contests: [], location: {}, administration, retrievedAt, expiresAt: retrievedAt, warnings: [] };
      }
    }
    const n = normalizeVoterInfo(sample as CivicVoterInfoResponse, election, retrievedAt);
    return {
      status: decideStatus(n.contests.length, n.warnings),
      provider: this.id,
      election,
      contests: n.contests,
      location: n.location,
      administration: n.administration,
      mailOnly: n.mailOnly,
      retrievedAt,
      expiresAt,
      warnings: n.warnings,
      districtDescriptors: n.districtDescriptors,
    };
  }
}
