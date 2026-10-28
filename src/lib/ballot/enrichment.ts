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
    Object.assign(merged.contests!, b.contests);
    Object.assign(merged.candidates!, b.candidates);
    Object.assign(merged.measures!, b.measures);
  }
  return merged;
}
