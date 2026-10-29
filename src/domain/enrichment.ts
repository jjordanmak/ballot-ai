/**
 * Researched, cited content layered on top of the official ballot.
 *
 * Official ballot facts (which contests, exact names, vote-for-N) come only
 * from the ballot resolver. Everything here is Tier 1–3 enrichment: every
 * item carries source ids that resolve to a `SourceDoc`. Content is neutral
 * (PRD §14) and organized by the FR-K4 profile sections.
 *
 * Bundles live in `src/data/enrichment/<election-slug>/*.json` (reviewed in
 * git); a database-backed EnrichmentProvider can replace the file loader
 * without touching the UI.
 */

export interface SourceDoc {
  title: string;
  publisher: string;
  url: string;
  /** Government / election-authority source. */
  official: boolean;
  /** YYYY-MM-DD the source was read. */
  accessed: string;
}

/** A statement plus the source ids that support it. */
export interface Cited {
  text: string;
  sources: string[];
}

export interface PollResult {
  pollster: string;
  /** Field dates, as published (e.g. "Oct 1–8, 2026"). */
  dates: string;
  population?: string;
  sampleSize?: number;
  marginOfError?: string;
  results: { name: string; pct: number }[];
  undecidedPct?: number;
  sources: string[];
}

export interface ContestEnrichment {
  /** What this office does / how the contest works (factual). */
  formatExplainer?: Cited;
  meta?: { label: string; value: string }[];
  context?: Cited;
  whyItMatters?: Cited;
  whatsAtStake?: Cited;
  bigPicture?: Cited;
  polling?: { summary?: Cited; poll?: PollResult };
  /** Issue rows for the side-by-side table, in display order. */
  issues?: { id: string; label: string }[];
}

export interface FundingSummary {
  /** Reporting period end, e.g. "2026-10-17". */
  asOf: string;
  /** Headline totals: raised, spent, cash on hand, debts… */
  totals: { label: string; amount: number }[];
  /** Every reported source category with its amount. */
  bySource?: { label: string; amount: number }[];
  independentExpenditures?: { committee: string; position: "support" | "oppose"; amount: number }[];
  /** Link to the full itemized contributor list on the official system. */
  fullListUrl?: string;
  sources: string[];
}

export interface CandidateEnrichment {
  /** Readable name (ballot name is always shown too). */
  displayName?: string;
  headshot?: { url: string; credit: string; sources: string[] };
  incumbent?: boolean;
  /** Occupation/designation printed under the name on the ballot (official). */
  ballotDesignation?: Cited;
  /** Campaign website from an official filing, when the provider has none. */
  campaignUrl?: string;
  /** Official campaign site / X account, each from an official filing (e.g. the SoS voter guide contact block). */
  links?: { kind: "campaign" | "x"; url: string; sources: string[] }[];
  currentRole?: Cited;
  platform?: Cited[];
  background?: Cited[];
  pastPositions?: { title: string; organization?: string; years?: string; sources: string[] }[];
  experience?: Cited[];
  trackRecord?: { priority: string; items: Cited[] }[];
  priorities?: Cited[];
  stances?: Cited[];
  /** issue id → documented position, for the side-by-side table. */
  issues?: Record<string, Cited>;
  timeline?: { year: string; event: string; sources: string[] }[];
  notableFacts?: Cited[];
  endorsements?: { name: string; category: string; sources: string[] }[];
  funding?: FundingSummary;
}

export interface MeasureEnrichment {
  /** Official ballot title / label. */
  title?: string;
  summary?: Cited;
  yesMeans?: Cited;
  noMeans?: Cited;
  fiscalEffect?: Cited;
  /**
   * "What it means for you": answers to fixed questions, only from official
   * nonpartisan analyses (e.g. California's Legislative Analyst). Missing
   * keys render "Not addressed in the official analysis".
   */
  impact?: {
    taxes?: Cited;
    cost?: Cited;
    money?: Cited;
    affected?: Cited;
    currentLaw?: Cited;
    kind?: Cited;
  };
  /** Official ballot arguments, attributed to their authors by the guide. */
  argumentFor?: Cited;
  argumentAgainst?: Cited;
  /** As listed in the official guide. */
  supporters?: Cited;
  opponents?: Cited;
  officialUrl?: string;
}

export interface EnrichmentBundle {
  /** Election slug the bundle applies to. */
  election: string;
  sources: Record<string, SourceDoc>;
  contests?: Record<string, ContestEnrichment>;
  candidates?: Record<string, CandidateEnrichment>;
  measures?: Record<string, MeasureEnrichment>;
}
