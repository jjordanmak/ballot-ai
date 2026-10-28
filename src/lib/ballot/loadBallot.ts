/**
 * Read a stored resolution for the ballot page. Expired rows are treated as
 * absent — the page asks for the address again rather than show stale data.
 */
import "server-only";
import type { ResolvedBallot } from "@/domain/ballot";
import { BALLOT_KEY_PATTERN } from "./ballotKey";
import { getBallotRuntime } from "./runtime";

export type LoadResult =
  | { state: "ok"; ballot: ResolvedBallot }
  | { state: "expired" }
  | { state: "not_found" };

export async function loadBallot(electionSlug: string, ballotKey: string, now = new Date()): Promise<LoadResult> {
  if (!BALLOT_KEY_PATTERN.test(ballotKey)) return { state: "not_found" };
  const runtime = getBallotRuntime();
  const ballot = await runtime.store.load(ballotKey);
  if (!ballot || ballot.election?.slug !== electionSlug) return { state: "expired" };
  if (Date.parse(ballot.expiresAt) <= now.getTime()) return { state: "expired" };
  return { state: "ok", ballot };
}
