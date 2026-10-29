/**
 * File-backed EnrichmentProvider: merges every reviewed bundle for an
 * election. Swappable for a database-backed provider later.
 */
import type { EnrichmentBundle } from "@/domain/enrichment";
import general2026 from "@/data/enrichment/2026-11-03";

const BUNDLES: Record<string, EnrichmentBundle[]> = {
  "2026-11-03": general2026,
};

export function getEnrichment(electionSlug: string): EnrichmentBundle {
  const merged: EnrichmentBundle = { election: electionSlug, sources: {}, contests: {}, candidates: {}, measures: {} };
  for (const b of BUNDLES[electionSlug] ?? []) {
    Object.assign(merged.sources, b.sources);
    mergeEntries(merged.contests!, b.contests);
    mergeEntries(merged.candidates!, b.candidates);
    mergeEntries(merged.measures!, b.measures);
  }
  return merged;
}

/** Bundles can each describe part of the same entry (e.g. official facts + official links): merge field by field. */
function mergeEntries<T extends object>(into: Record<string, T>, from: Record<string, T> | undefined) {
  for (const [key, entry] of Object.entries(from ?? {})) into[key] = { ...into[key], ...entry };
}
