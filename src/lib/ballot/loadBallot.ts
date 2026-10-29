/**
 * Read a stored resolution for the ballot page. Expired rows are treated as
 * absent — the page asks for the address again rather than show stale data.
 */
import "server-only";
import type { ResolvedBallot } from "@/domain/ballot";
import { BALLOT_KEY_PATTERN } from "./ballotKey";
import { logEvent } from "@/lib/observability/log";
import { getBallotRuntime } from "./runtime";

export type LoadResult =
  | { state: "ok"; ballot: ResolvedBallot }
  | { state: "expired" }
  | { state: "not_found" }
  /** Storage is down: say so, never render an empty ballot or a bare 500. */
  | { state: "unavailable" };

export async function loadBallot(electionSlug: string, ballotKey: string, now = new Date()): Promise<LoadResult> {
  if (!BALLOT_KEY_PATTERN.test(ballotKey)) return { state: "not_found" };
  const runtime = getBallotRuntime();
  let ballot: ResolvedBallot | null;
  try {
    ballot = await runtime.store.load(ballotKey);
  } catch (e) {
    logEvent("ballot.load_failed", { error: e instanceof Error ? e.message : "unknown" });
    return { state: "unavailable" };
  }
  if (!ballot || ballot.election?.slug !== electionSlug) return { state: "expired" };
  if (Date.parse(ballot.expiresAt) <= now.getTime()) return { state: "expired" };
  return { state: "ok", ballot };
}
