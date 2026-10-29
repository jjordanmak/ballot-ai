/**
 * Google Civic Information API v2 response shapes (subset we consume).
 *
 * Transcribed from the API discovery document (revision 20261028). All
 * fields optional: the API omits rather than nulls. These types must not
 * escape `src/lib/providers/google-civic/`.
 */

export interface CivicSource {
  name?: string;
  official?: boolean;
}

export interface CivicElection {
  id?: string;
  name?: string;
  electionDay?: string;
  ocdDivisionId?: string;
  shapeLookupBehavior?: string;
}

export interface CivicElectionsResponse {
  kind?: string;
  elections?: CivicElection[];
}

export interface CivicChannel {
  type?: string;
  id?: string;
}

export interface CivicCandidate {
  name?: string;
  party?: string;
  orderOnBallot?: string;
  candidateUrl?: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  channels?: CivicChannel[];
}

export interface CivicElectoralDistrict {
  name?: string;
  scope?: string;
  id?: string;
}

export interface CivicContest {
  type?: string;
  office?: string;
  ballotTitle?: string;
  level?: string[];
  roles?: string[];
  district?: CivicElectoralDistrict;
  numberElected?: string;
  numberVotingFor?: string;
  ballotPlacement?: string;
  primaryParties?: string[];
  special?: string;
  electorateSpecifications?: string;
  sources?: CivicSource[];
  candidates?: CivicCandidate[];
  referendumTitle?: string;
  referendumSubtitle?: string;
  referendumBrief?: string;
  referendumText?: string;
  referendumUrl?: string;
  referendumBallotResponses?: string[];
  referendumPassageThreshold?: string;
  referendumEffectOfAbstain?: string;
  referendumProStatement?: string;
  referendumConStatement?: string;
}

export interface CivicSimpleAddress {
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  zip?: string;
  locationName?: string;
}

export interface CivicAdministrativeBody {
  name?: string;
  electionInfoUrl?: string;
  ballotInfoUrl?: string;
  votingLocationFinderUrl?: string;
  electionRegistrationUrl?: string;
  electionRegistrationConfirmationUrl?: string;
}

export interface CivicAdministrationRegion {
  name?: string;
  electionAdministrationBody?: CivicAdministrativeBody;
  local_jurisdiction?: CivicAdministrationRegion;
  sources?: CivicSource[];
}

export interface CivicVoterInfoResponse {
  kind?: string;
  election?: CivicElection;
  otherElections?: CivicElection[];
  normalizedInput?: CivicSimpleAddress;
  contests?: CivicContest[];
  state?: CivicAdministrationRegion[];
  mailOnly?: boolean;
  precinctId?: string;
  // Location arrays are intentionally not typed: we don't consume them in P0.
  pollingLocations?: unknown[];
  earlyVoteSites?: unknown[];
  dropOffLocations?: unknown[];
  precincts?: unknown[];
}

/** Google API error envelope. */
export interface GoogleApiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: { reason?: string; message?: string; domain?: string }[];
  };
}

/** Top-level keys we expect; anything else is reported as a possible shape change. */
export const KNOWN_VOTERINFO_KEYS = new Set([
  "kind",
  "election",
  "otherElections",
  "normalizedInput",
  "contests",
  "state",
  "mailOnly",
  "precinctId",
  "pollingLocations",
  "earlyVoteSites",
  "dropOffLocations",
  "precincts",
]);
