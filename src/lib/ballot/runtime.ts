/**
 * Wires providers + storage from the environment. The only place that
 * knows which concrete resolver is in use.
 *
 *   BALLOT_PROVIDER=fixture      fictional sample data, in-memory storage
 *   BALLOT_PROVIDER=google-civic (default) live Civic + Supabase
 */
import "server-only";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { CompositeBallotResolver } from "@/lib/providers/composite";
import { GoogleCivicBallotResolver } from "@/lib/providers/google-civic/resolver";
import type { BallotResolver } from "@/lib/providers/types";
import { FixtureElectionSource, SupabaseElectionSource, type ElectionSource } from "./elections";
import { MemoryBallotStore, SupabaseBallotStore, type BallotStore } from "./store";

export interface BallotRuntime {
  mode: "fixture" | "google-civic";
  elections: ElectionSource;
  resolver: BallotResolver;
  store: BallotStore;
}

const g = globalThis as unknown as { __ballotRuntime?: BallotRuntime };

export function getBallotRuntime(): BallotRuntime {
  if (g.__ballotRuntime) return g.__ballotRuntime;
  const mode = process.env.BALLOT_PROVIDER === "fixture" ? "fixture" : "google-civic";
  if (mode === "fixture" && process.env.VERCEL_ENV === "production") {
    throw new Error("BALLOT_PROVIDER=fixture is not allowed in production");
  }
  g.__ballotRuntime =
    mode === "fixture"
      ? {
          mode,
          elections: new FixtureElectionSource(),
          resolver: new FixtureBallotResolver(),
          store: new MemoryBallotStore(),
        }
      : {
          mode,
          elections: new SupabaseElectionSource(),
          resolver: new CompositeBallotResolver([new GoogleCivicBallotResolver()]),
          store: new SupabaseBallotStore(),
        };
  return g.__ballotRuntime;
}

/** Test hook. */
export function setBallotRuntime(r: BallotRuntime | undefined) {
  g.__ballotRuntime = r;
}
