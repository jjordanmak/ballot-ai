/**
 * Google Civic implementations of ElectionProvider and BallotResolver.
 */
import "server-only";
import type { ElectionRef, ResolutionStatus, ResolvedBallot } from "@/domain/ballot";
import type { AddressInput } from "../address";
import type { BallotResolver, ElectionProvider, ProviderElection, ProviderResult } from "../types";
import { GoogleCivicClient } from "./client";
import { districtsFrom } from "@/domain/districts";
import { normalizeVoterInfo } from "./normalize";
import { clampTtl, decideStatus } from "./status";

export class GoogleCivicElectionProvider implements ElectionProvider {
  readonly id = "google-civic" as const;
  constructor(private readonly client = new GoogleCivicClient()) {}

  async getElections(): Promise<ProviderResult<ProviderElection[]>> {
    const res = await this.client.elections();
    if (!res.ok) {
      return {
        ok: false,
        kind: res.failure === "RATE_LIMITED" ? "RATE_LIMITED" : "PROVIDER_ERROR",
        detail: res.reason ?? res.failure,
      };
    }
    const value = (res.body.elections ?? [])
      .filter((e) => e.id && e.electionDay)
      .map((e) => ({
        provider: this.id,
        externalId: e.id!,
        name: e.name ?? "",
        date: e.electionDay!,
        ocdDivisionId: e.ocdDivisionId,
      }));
    return { ok: true, value };
  }
}

/**
 * Pick the provider election for a ballot.ai election: same date, preferring
 * the national division. Never assumes a hard-coded id.
 */
export function matchProviderElection(
  elections: ProviderElection[],
  date: string,
  override?: string,
): ProviderElection | undefined {
  if (override) return elections.find((e) => e.externalId === override && e.date === date);
  const sameDay = elections.filter((e) => e.date === date);
  return (
    sameDay.find((e) => e.ocdDivisionId === "ocd-division/country:us") ??
    (sameDay.length === 1 ? sameDay[0] : undefined)
  );
}

export class GoogleCivicBallotResolver implements BallotResolver {
  readonly id = "google-civic" as const;
  constructor(
    private readonly client = new GoogleCivicClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveBallot(address: AddressInput, election: ElectionRef): Promise<ResolvedBallot> {
    const retrievedAt = this.now().toISOString();
    const civicId = election.externalIds["google-civic"];
    if (!civicId) return failed("ELECTION_NOT_FOUND", election, retrievedAt, "no google-civic election id");

    const res = await this.client.voterInfo(address, civicId);
    if (!res.ok) return failed(res.failure, election, retrievedAt, res.reason);

    const n = normalizeVoterInfo(res.body, election, retrievedAt);
    // Districts with no race this year (e.g. State Senate) only come from divisionsByAddress. Best effort.
    const divisionIds =
      n.contests.length > 0
        ? await this.client.divisions(address).then((d) => (d.ok ? Object.keys(d.body.divisions ?? {}) : []))
        : [];
    const ttl = clampTtl(res.maxAgeSeconds);
    const expiresAt = new Date(Date.parse(retrievedAt) + ttl * 1000).toISOString();

    return {
      status: decideStatus(n.contests.length, n.warnings),
      provider: this.id,
      election,
      contests: n.contests,
      location: n.location,
      districts: districtsFrom(divisionIds, n.contests),
      administration: n.administration,
      mailOnly: n.mailOnly,
      retrievedAt,
      expiresAt,
      warnings:
        n.contests.length === 0
          ? [...n.warnings, { code: "ZERO_CONTESTS", severity: "error" }]
          : n.warnings,
      // Households share a cached ballot only when their contests, districts and ZIP all match.
      districtDescriptors: [
        ...n.districtDescriptors,
        ...divisionIds.map((id) => `ocd:${id}`),
        ...(n.location.zip ? [`zip:${n.location.zip}`] : []),
      ],
    };
  }
}

function failed(
  status: ResolutionStatus,
  election: ElectionRef,
  retrievedAt: string,
  detail?: string,
): ResolvedBallot {
  return {
    status,
    provider: "google-civic",
    election,
    contests: [],
    location: {},
    retrievedAt,
    expiresAt: retrievedAt,
    warnings: [],
    statusDetail: detail,
  };
}
