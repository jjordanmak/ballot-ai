/**
 * ballot.ai domain model.
 *
 * The UI and application services depend ONLY on these types. Provider
 * response shapes (Google Civic, future VIP/state feeds) stop at the adapter
 * boundary in `src/lib/providers/`. See docs/architecture/DATA_MODEL.md.
 *
 * Nothing in this file may carry a residential address.
 */

export type ProviderId = "google-civic" | "fixture" | "durable" | "manual";

export type ResolutionStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "INVALID_ADDRESS"
  | "AMBIGUOUS_ADDRESS"
  | "ELECTION_NOT_FOUND"
  | "NO_COVERAGE"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

/** Statuses that come with a renderable ballot. */
export const BALLOT_STATUSES: readonly ResolutionStatus[] = ["SUCCESS", "PARTIAL"];

export type Provenance = "official" | "source_derived" | "ai_generated";

export interface SourceRef {
  provider: ProviderId;
  /** Human-readable source name, e.g. "California Secretary of State". */
  name: string;
  url?: string;
  official: boolean;
  /** ISO timestamp the data was fetched. */
  retrievedAt: string;
  /** ISO timestamp a human or official-record check verified it. */
  verifiedAt?: string;
}

export type ElectionStatus = "upcoming" | "active" | "archived";

export interface ElectionRef {
  /** ballot.ai election id (e.g. `us-2026-11-03-general`). */
  id: string;
  slug: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** Provider-specific election ids, keyed by provider. */
  externalIds: Partial<Record<ProviderId, string>>;
}

export interface Division {
  /** OCD id when known, otherwise `{scope}:{id}:{normalized name}`. */
  key: string;
  ocdId?: string;
  name: string;
  /** Open-ended scope string (provider vocabulary preserved). */
  scope?: string;
  /** District number/identifier relative to scope, when provided. */
  districtId?: string;
}

/** Raw contest kinds we recognize. Unknown provider types map to "other". */
export type ContestType = "general" | "primary" | "runoff" | "retention" | "referendum" | "other";

export type ContestCategory =
  | "federal"
  | "statewide"
  | "state_legislature"
  | "judicial"
  | "county"
  | "city"
  | "education"
  | "special_district"
  | "measures"
  | "other";

/** Display order for ballot groups. */
export const CATEGORY_ORDER: readonly ContestCategory[] = [
  "federal",
  "statewide",
  "state_legislature",
  "judicial",
  "county",
  "city",
  "education",
  "special_district",
  "measures",
  "other",
];

export const CATEGORY_LABEL: Record<ContestCategory, string> = {
  federal: "Federal",
  statewide: "Statewide",
  state_legislature: "State Legislature",
  judicial: "Judicial",
  county: "County",
  city: "City / Municipal",
  education: "Education",
  special_district: "Special Districts",
  measures: "Ballot Measures",
  other: "Other",
};

export interface CandidateChoice {
  id: string;
  /** Exactly as provided by the authoritative source. Never normalized for display. */
  ballotName: string;
  party?: string;
  /** Ballot designation (e.g. CA occupation designation), when available. */
  designation?: string;
  incumbent?: boolean;
  orderOnBallot?: number;
  urls: {
    campaign?: string;
    photo?: string;
    channels: { type: string; id: string }[];
  };
  sources: SourceRef[];
}

export interface Measure {
  id: string;
  /** e.g. "Proposition 50", "Measure A". */
  identifier?: string;
  title: string;
  subtitle?: string;
  /** Short ballot summary. */
  brief?: string;
  text?: string;
  url?: string;
  /** Ballot response lines, e.g. ["Yes", "No"]. */
  responses: string[];
  passageThreshold?: string;
  effectOfAbstain?: string;
  /** Official arguments (attributed to their authors by the source). */
  proStatement?: string;
  conStatement?: string;
  sources: SourceRef[];
}

export interface Contest {
  id: string;
  kind: "candidate" | "measure";
  contestType: ContestType;
  /** Raw provider type, kept for debugging/unknown-type reporting. */
  rawType?: string;
  /** Office name or measure title. */
  title: string;
  ballotTitle?: string;
  division: Division;
  category: ContestCategory;
  numberElected?: number;
  /** How many choices a voter may select. */
  voteFor?: number;
  primaryParties?: string[];
  special: boolean;
  ballotOrder?: number;
  electorateSpecifications?: string;
  roles: string[];
  levels: string[];
  choices: CandidateChoice[];
  measure?: Measure;
  sources: SourceRef[];
  verification?: {
    status: "verified" | "discrepancy" | "unverified";
    source?: SourceRef;
    note?: string;
  };
}

/** Coarse, shareable location context. Never a street or house number. */
export interface CoarseLocation {
  city?: string;
  county?: string;
  state?: string;
}

export type WarningCode =
  | "ZERO_CONTESTS"
  | "DUPLICATE_CONTEST"
  | "DUPLICATE_CANDIDATE"
  | "CONTEST_WITHOUT_CHOICES"
  | "MEASURE_WITHOUT_TITLE"
  | "MEASURE_SUMMARY_MISSING"
  | "MISSING_SOURCE"
  | "NAME_CONFLICT"
  | "STALE_ELECTION"
  | "ELECTION_DATE_MISMATCH"
  | "MISSING_JURISDICTION"
  | "UNSUPPORTED_CONTEST_TYPE"
  | "UNKNOWN_DISTRICT_SCOPE"
  | "NUMBER_PARSE"
  | "SOURCE_CONFLICT"
  | "PROVIDER_SHAPE_CHANGE"
  | "PROVIDER_PARTIAL";

export interface BallotWarning {
  code: WarningCode;
  severity: "info" | "warn" | "error";
  contestId?: string;
  detail?: string;
}

export interface ElectionAdministration {
  name?: string;
  electionInfoUrl?: string;
  ballotInfoUrl?: string;
  votingLocationFinderUrl?: string;
}

export interface ResolvedBallot {
  status: ResolutionStatus;
  provider: ProviderId;
  election?: ElectionRef;
  contests: Contest[];
  location: CoarseLocation;
  administration?: ElectionAdministration;
  /** True when the provider reports voters here vote by mail only. */
  mailOnly?: boolean;
  retrievedAt: string;
  /** When this resolution must be discarded (provider freshness). */
  expiresAt: string;
  warnings: BallotWarning[];
  /**
   * Sorted, address-free district descriptors (`scope:id:name`) of the
   * contests returned. Input to the ballot key; shared by every household
   * with the same ballot.
   */
  districtDescriptors?: string[];
  /** Upstream reason for a non-ballot status (no address content). */
  statusDetail?: string;
  /** Address-free geography key; set once persisted. */
  ballotKey?: string;
}

export function hasBallot(b: Pick<ResolvedBallot, "status">): boolean {
  return BALLOT_STATUSES.includes(b.status);
}
