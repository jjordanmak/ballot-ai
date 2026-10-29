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
import { logEvent } from "@/lib/observability/log";
import { FixtureElectionSource, SupabaseElectionSource, type ElectionSource } from "./elections";
import { MemoryBallotStore, SupabaseBallotStore, type BallotStore } from "./store";
import { NoDurableRegistry, SupabaseDurableRegistry, type DurableRegistry } from "./durable";

export interface BallotRuntime {
  mode: "fixture" | "google-civic";
  elections: ElectionSource;
  resolver: BallotResolver;
  store: BallotStore;
  /** Persists contests/candidates for live feeds; a no-op without Supabase. */
  durable: DurableRegistry;
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
          durable: new NoDurableRegistry(),
        }
      : {
          mode,
          elections: new SupabaseElectionSource(),
          resolver: new CompositeBallotResolver([new GoogleCivicBallotResolver()]),
          store: liveStore(),
          durable: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VERCEL ? new SupabaseDurableRegistry() : new NoDurableRegistry(),
        };
  return g.__ballotRuntime;
}

/**
 * Supabase in every deployed environment. Locally, without a service-role
 * key (e.g. a Claude Code cloud session), keep resolutions in memory so the
 * live Civic flow can still be exercised — never on Vercel.
 */
function liveStore(): BallotStore {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VERCEL) return new SupabaseBallotStore();
  logEvent("ballot.store_memory_fallback", { reason: "no SUPABASE_SERVICE_ROLE_KEY outside Vercel" });
  return new MemoryBallotStore();
}

/** Test hook. */
export function setBallotRuntime(r: BallotRuntime | undefined) {
  g.__ballotRuntime = r;
}
