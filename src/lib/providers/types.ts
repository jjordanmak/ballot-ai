/**
 * Provider capability interfaces. See docs/architecture/PROVIDER_ARCHITECTURE.md.
 *
 * Providers implement only the capabilities they have; the application
 * service composes them. UI code must never import from this directory.
 */
import type { ElectionRef, ProviderId, ResolvedBallot } from "@/domain/ballot";
import type { AddressInput } from "./address";

export interface ProviderElection {
  provider: ProviderId;
  externalId: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  ocdDivisionId?: string;
}

export type ProviderErrorKind = "RATE_LIMITED" | "PROVIDER_ERROR";

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: ProviderErrorKind; detail: string };

export interface ElectionProvider {
  readonly id: ProviderId;
  getElections(): Promise<ProviderResult<ProviderElection[]>>;
}

export interface BallotResolver {
  readonly id: ProviderId;
  /** Never throws for upstream failures — they map to a ResolutionStatus. */
  resolveBallot(address: AddressInput, election: ElectionRef): Promise<ResolvedBallot>;
}
