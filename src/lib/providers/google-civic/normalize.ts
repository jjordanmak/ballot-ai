/**
 * Google Civic `voterinfo` → ballot.ai domain.
 *
 * Pure: no I/O, no clock (timestamps are passed in). Never copies the
 * voter's address — `normalizedInput` contributes only city/state.
 * See docs/architecture/PROVIDER_ARCHITECTURE.md §4.
 */
import type {
  BallotWarning,
  CandidateChoice,
  CoarseLocation,
  Contest,
  ContestType,
  Division,
  ElectionAdministration,
  ElectionRef,
  Measure,
  SourceRef,
} from "@/domain/ballot";
import { categorizeContest, KNOWN_SCOPES } from "@/domain/categorize";
import { stableId } from "@/domain/ids";
import { normalizeForMatch, parseCount } from "@/domain/text";
import {
  KNOWN_VOTERINFO_KEYS,
  type CivicCandidate,
  type CivicContest,
  type CivicSource,
  type CivicVoterInfoResponse,
} from "./types";

export const NORMALIZER_VERSION = "civic-v2.1";

const CIVIC_CONDUIT = "Google Civic Information API";

export interface NormalizedVoterInfo {
  contests: Contest[];
  location: CoarseLocation;
  administration?: ElectionAdministration;
  mailOnly?: boolean;
  /** Provider's election id + day, for verification against the requested election. */
  providerElection?: { id?: string; date?: string; name?: string };
  /** District descriptors for the ballot key (address-free). */
  districtDescriptors: string[];
  warnings: BallotWarning[];
}

export function normalizeVoterInfo(
  res: CivicVoterInfoResponse,
  election: ElectionRef,
  retrievedAt: string,
): NormalizedVoterInfo {
  const warnings: BallotWarning[] = [];

  const unknownKeys = Object.keys(res).filter((k) => !KNOWN_VOTERINFO_KEYS.has(k));
  if (unknownKeys.length) {
    warnings.push({
      code: "PROVIDER_SHAPE_CHANGE",
      severity: "info",
      detail: `unexpected top-level keys: ${unknownKeys.join(", ")}`,
    });
  }
  if (res.contests !== undefined && !Array.isArray(res.contests)) {
    warnings.push({ code: "PROVIDER_SHAPE_CHANGE", severity: "error", detail: "contests is not an array" });
  }

  const providerDate = res.election?.electionDay;
  if (providerDate && providerDate !== election.date) {
    warnings.push({
      code: "ELECTION_DATE_MISMATCH",
      severity: "error",
      detail: `provider electionDay ${providerDate} ≠ expected ${election.date}`,
    });
  }

  const raw = Array.isArray(res.contests) ? res.contests : [];
  const indexed = raw.map((c, i) => ({ c, i, placement: parseCount(c.ballotPlacement) ?? undefined }));
  indexed.sort((a, b) => (a.placement ?? Infinity) - (b.placement ?? Infinity) || a.i - b.i);

  const contests: Contest[] = [];
  const byKey = new Map<string, Contest>();

  for (const { c } of indexed) {
    const contest = normalizeContest(c, election, retrievedAt, warnings);
    const matchKey = `${contest.division.key}|${normalizeForMatch(contest.measure?.identifier ?? contest.title)}`;
    const existing = byKey.get(matchKey);
    if (existing) {
      const same = sameChoices(existing, contest);
      warnings.push({
        code: "DUPLICATE_CONTEST",
        severity: same ? "info" : "warn",
        contestId: existing.id,
        detail: same ? "identical duplicate dropped" : "duplicate title with different choices kept",
      });
      if (same) continue;
      contest.id = stableId("ct", election.id, matchKey, String(contests.length));
    }
    byKey.set(matchKey, contest);
    contests.push(contest);
  }

  const descriptors = [...new Set(contests.map((c) => c.division.key))].sort();

  return {
    contests,
    location: coarseLocation(res),
    administration: administration(res),
    mailOnly: res.mailOnly,
    providerElection: res.election
      ? { id: res.election.id, date: res.election.electionDay, name: res.election.name }
      : undefined,
    districtDescriptors: descriptors,
    warnings,
  };
}

function normalizeContest(
  c: CivicContest,
  election: ElectionRef,
  retrievedAt: string,
  warnings: BallotWarning[],
): Contest {
  const isMeasure = /^referendum$/i.test(c.type ?? "");
  const contestType = mapContestType(c.type);
  const division = mapDivision(c);
  const title = (isMeasure
    ? c.referendumSubtitle || c.ballotTitle || c.referendumTitle || c.office
    : c.office || c.ballotTitle) ?? "";
  const id = stableId(
    "ct",
    election.id,
    division.key,
    normalizeForMatch(isMeasure ? c.referendumTitle ?? title : title),
  );

  if (!c.district) {
    warnings.push({ code: "MISSING_JURISDICTION", severity: "warn", contestId: id });
  } else if (c.district.scope && !KNOWN_SCOPES.has(c.district.scope.toLowerCase())) {
    warnings.push({
      code: "UNKNOWN_DISTRICT_SCOPE",
      severity: "info",
      contestId: id,
      detail: c.district.scope,
    });
  }
  if (contestType === "other") {
    warnings.push({
      code: "UNSUPPORTED_CONTEST_TYPE",
      severity: "info",
      contestId: id,
      detail: c.type ?? "(missing)",
    });
  }

  const sources = mapSources(c.sources, retrievedAt);
  if (!c.sources?.length) {
    warnings.push({ code: "MISSING_SOURCE", severity: "info", contestId: id });
  }

  const numberElected = countField(c.numberElected, "numberElected", id, warnings);
  const voteFor = countField(c.numberVotingFor, "numberVotingFor", id, warnings);

  const choices = isMeasure ? [] : mapCandidates(c.candidates ?? [], id, sources, warnings);
  if (!isMeasure && choices.length === 0) {
    warnings.push({ code: "CONTEST_WITHOUT_CHOICES", severity: "warn", contestId: id });
  }

  let measure: Measure | undefined;
  if (isMeasure) {
    measure = mapMeasure(c, id, sources);
    if (!measure.title) {
      warnings.push({ code: "MEASURE_WITHOUT_TITLE", severity: "warn", contestId: id });
    }
  }

  return {
    id,
    kind: isMeasure ? "measure" : "candidate",
    contestType,
    rawType: c.type,
    title: title || measure?.identifier || "",
    ballotTitle: c.ballotTitle,
    division,
    category: categorizeContest({
      kind: isMeasure ? "measure" : "candidate",
      scope: c.district?.scope,
      roles: c.roles,
      levels: c.level,
      title,
    }),
    numberElected,
    voteFor,
    primaryParties: c.primaryParties,
    special: /^yes$/i.test(c.special ?? ""),
    ballotOrder: parseCount(c.ballotPlacement) ?? undefined,
    electorateSpecifications: c.electorateSpecifications,
    roles: c.roles ?? [],
    levels: c.level ?? [],
    choices,
    measure,
    sources,
  };
}

function mapContestType(t: string | undefined): ContestType {
  const v = (t ?? "").trim().toLowerCase();
  if (v === "general") return "general";
  if (v === "primary") return "primary";
  if (v === "run-off" || v === "runoff") return "runoff";
  if (v === "referendum") return "referendum";
  if (v.includes("retention")) return "retention";
  return "other";
}

function mapDivision(c: CivicContest): Division {
  const d = c.district;
  if (!d) return { key: `unknown::${normalizeForMatch(c.office ?? c.referendumTitle)}`, name: "" };
  const scope = d.scope?.toLowerCase();
  return {
    key: `${scope ?? "unknown"}:${d.id ?? ""}:${normalizeForMatch(d.name)}`,
    name: d.name ?? "",
    scope: d.scope,
    districtId: d.id,
  };
}

function mapSources(src: CivicSource[] | undefined, retrievedAt: string): SourceRef[] {
  const out: SourceRef[] = (src ?? []).map((s) => ({
    provider: "google-civic",
    name: s.name?.trim() || CIVIC_CONDUIT,
    official: s.official === true,
    retrievedAt,
  }));
  // Always record the conduit so "where did this come from" has an answer.
  if (!out.some((s) => s.name === CIVIC_CONDUIT)) {
    out.push({
      provider: "google-civic",
      name: CIVIC_CONDUIT,
      url: "https://developers.google.com/civic-information",
      official: false,
      retrievedAt,
    });
  }
  return out;
}

function mapCandidates(
  raw: CivicCandidate[],
  contestId: string,
  sources: SourceRef[],
  warnings: BallotWarning[],
): CandidateChoice[] {
  const seen = new Set<string>();
  const out: (CandidateChoice & { _i: number })[] = [];
  raw.forEach((c, i) => {
    const name = c.name?.trim();
    if (!name) return;
    const key = normalizeForMatch(name);
    if (seen.has(key)) {
      warnings.push({ code: "DUPLICATE_CANDIDATE", severity: "warn", contestId, detail: name });
      return;
    }
    seen.add(key);
    out.push({
      _i: i,
      id: stableId("cd", contestId, key),
      ballotName: name,
      party: c.party?.trim() || undefined,
      orderOnBallot: parseCount(c.orderOnBallot) ?? undefined,
      urls: {
        campaign: safeUrl(c.candidateUrl),
        photo: safeUrl(c.photoUrl),
        channels: (c.channels ?? [])
          .filter((ch): ch is { type: string; id: string } => !!ch.type && !!ch.id)
          .map((ch) => ({ type: ch.type, id: ch.id })),
      },
      sources,
    });
  });
  out.sort((a, b) => (a.orderOnBallot ?? Infinity) - (b.orderOnBallot ?? Infinity) || a._i - b._i);
  return out.map(({ _i, ...c }) => c);
}

function mapMeasure(c: CivicContest, contestId: string, sources: SourceRef[]): Measure {
  const rt = c.referendumTitle?.trim();
  const looksLikeIdentifier = !!rt && IDENTIFIER.test(rt);
  return {
    id: stableId("ms", contestId),
    identifier: looksLikeIdentifier ? rt : undefined,
    title: (c.referendumSubtitle || c.ballotTitle || (!looksLikeIdentifier ? rt : undefined) || "").trim(),
    subtitle: looksLikeIdentifier ? undefined : c.referendumSubtitle,
    brief: c.referendumBrief,
    text: c.referendumText,
    url: safeUrl(c.referendumUrl),
    responses: c.referendumBallotResponses ?? [],
    passageThreshold: c.referendumPassageThreshold,
    effectOfAbstain: c.referendumEffectOfAbstain,
    proStatement: c.referendumProStatement,
    conStatement: c.referendumConStatement,
    sources,
  };
}

const IDENTIFIER =
  /^(proposition|prop\.?|measure|question|amendment|issue|initiative|referendum|constitutional amendment|ballot measure)\s*[\w-]+$/i;

function countField(
  raw: string | undefined,
  field: string,
  contestId: string,
  warnings: BallotWarning[],
): number | undefined {
  const n = parseCount(raw);
  if (n === null) {
    warnings.push({ code: "NUMBER_PARSE", severity: "warn", contestId, detail: `${field}=${raw}` });
    return undefined;
  }
  return n;
}

function sameChoices(a: Contest, b: Contest): boolean {
  const names = (c: Contest) => c.choices.map((x) => normalizeForMatch(x.ballotName)).sort().join("|");
  return names(a) === names(b);
}

/** Only http(s) URLs survive normalization; anything else (javascript:, data:) is dropped. */
export function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function coarseLocation(res: CivicVoterInfoResponse): CoarseLocation {
  const local = res.state?.[0]?.local_jurisdiction?.name;
  return {
    city: res.normalizedInput?.city || undefined,
    state: res.normalizedInput?.state || undefined,
    county: local && /county/i.test(local) ? local : undefined,
  };
}

function administration(res: CivicVoterInfoResponse): ElectionAdministration | undefined {
  const region = res.state?.[0];
  const body = region?.local_jurisdiction?.electionAdministrationBody ?? region?.electionAdministrationBody;
  if (!body) return undefined;
  return {
    name: body.name ?? region?.local_jurisdiction?.name ?? region?.name,
    electionInfoUrl: safeUrl(body.electionInfoUrl),
    ballotInfoUrl: safeUrl(body.ballotInfoUrl),
    votingLocationFinderUrl: safeUrl(body.votingLocationFinderUrl),
  };
}
