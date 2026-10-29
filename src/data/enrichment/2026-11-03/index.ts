/**
 * Researched content for the November 3, 2026 general election.
 * Every item cites sources defined in the same bundle. See
 * src/domain/enrichment.ts for the schema and PRD §11.5 FR-K4.
 */
import type { EnrichmentBundle } from "@/domain/enrichment";
import caCertifiedCandidates from "./ca-certified-candidates.json";
import caJustices from "./ca-justices.json";
import caOfficialLinks from "./ca-official-links.json";
import caStatewideMeasures from "./ca-statewide-measures.json";
import dalyCityCouncil from "./daly-city-council.json";

const bundles: EnrichmentBundle[] = [
  caStatewideMeasures as EnrichmentBundle,
  caCertifiedCandidates as EnrichmentBundle,
  caJustices as EnrichmentBundle,
  caOfficialLinks as EnrichmentBundle,
  dalyCityCouncil as EnrichmentBundle,
];

export default bundles;
