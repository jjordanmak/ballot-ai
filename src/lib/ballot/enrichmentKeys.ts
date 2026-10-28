/**
 * Stable, human-readable keys that join live ballot contests to researched
 * enrichment. Built from official names (normalized for matching only), so
 * they survive provider id changes and are reviewable in content files.
 *
 *   contest:   "california|governor"
 *   candidate: "california|governor::xavier becerra"
 *   measure:   "california|proposition 1"
 */
import type { CandidateChoice, Contest } from "@/domain/ballot";
import { normalizeForMatch } from "@/domain/text";

export function contestKey(c: Pick<Contest, "division" | "title">): string {
  return `${normalizeForMatch(c.division.name)}|${normalizeForMatch(c.title)}`;
}

export function candidateKey(c: Pick<Contest, "division" | "title">, choice: Pick<CandidateChoice, "ballotName">): string {
  return `${contestKey(c)}::${normalizeForMatch(choice.ballotName)}`;
}

export function measureKey(c: Pick<Contest, "division" | "title" | "measure">): string {
  return `${normalizeForMatch(c.division.name)}|${normalizeForMatch(c.measure?.identifier || c.measure?.title || c.title)}`;
}
