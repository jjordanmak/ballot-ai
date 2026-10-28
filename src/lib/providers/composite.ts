/**
 * Composition point for multiple resolvers (P3: direct feeds → state →
 * Google Civic fallback). Today it wraps a single resolver; the contract is
 * that the first ballot-bearing answer wins and failures fall through.
 * Merging across resolvers by contest match key is deliberately not built yet.
 */
import type { ElectionRef, ResolvedBallot } from "@/domain/ballot";
import { hasBallot } from "@/domain/ballot";
import type { AddressInput } from "./address";
import type { BallotResolver } from "./types";

export class CompositeBallotResolver implements BallotResolver {
  readonly id;
  constructor(private readonly resolvers: BallotResolver[]) {
    if (!resolvers.length) throw new Error("CompositeBallotResolver needs at least one resolver");
    this.id = resolvers[0].id;
  }

  async resolveBallot(address: AddressInput, election: ElectionRef): Promise<ResolvedBallot> {
    let last: ResolvedBallot | undefined;
    for (const r of this.resolvers) {
      const result = await r.resolveBallot(address, election);
      if (hasBallot(result)) return result;
      // Address problems are authoritative; don't let a fallback mask them.
      if (result.status === "INVALID_ADDRESS" || result.status === "AMBIGUOUS_ADDRESS") return result;
      last = result;
    }
    return last!;
  }
}
