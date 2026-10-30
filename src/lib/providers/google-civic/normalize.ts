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
import { categorizeContest, KNOWN_SCOPES, STATE_NAMES } from "@/domain/categorize";
import { stableId } from "@/domain/ids";
import { normalizeForMatch, parseCount } from "@/domain/text";
import {
  KNOWN_VOTERINFO_KEYS,
  type CivicCandidate,
  type CivicContest,
  type CivicSource,
  type CivicVoterInfoResponse,
} from "./types";

export const NORMALIZER_VERSION = "civic-v2.2";

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
    const contest = normalizeContest(c, election, retrievedAt, warnings, stateCode(res));
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
    location: coarseLocation(res, contests),
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
  stateCode: string | undefined,
): Contest {
  // Some counties send each judge's retention question as a referendum
  // ("For Associate Justice, …, NAME"); it is a retention contest for that judge.
  const retention = !c.candidates?.length ? retentionQuestion(c.referendumTitle || c.ballotTitle || c.office || "") : null;
  // VIP feeds send measures as "ballot-measure"; Civic docs say "Referendum".
  const isMeasure = !retention && (/^(referendum|ballot[- ]?measure|measure|proposition|initiative)$/i.test(c.type ?? "") ||
    (!c.candidates?.length && !!c.referendumTitle));
  let contestType = retention ? "retention" : mapContestType(c.type, isMeasure);
  const parsed = isMeasure ? parseMeasureTitle(c.referendumTitle || c.ballotTitle || c.office || "") : undefined;
  const title = (isMeasure
    ? parsed!.identifier || c.referendumSubtitle || parsed!.remainder || c.ballotTitle || c.office
    : retention?.office ?? (c.office || c.ballotTitle)) ?? "";

  const category = retention ? "judicial" : categorizeContest({
    kind: isMeasure ? "measure" : "candidate",
    scope: c.district?.scope,
    roles: c.roles,
    levels: c.level,
    title,
    districtName: c.district?.name,
  });
  // Retention questions often arrive typed "General"; the office or ballot wording says otherwise.
  if (!isMeasure && contestType !== "retention" && category === "judicial" &&
      /\b(retain|retained|retention)\b/i.test(`${c.office ?? ""} ${c.ballotTitle ?? ""}`)) {
    contestType = "retention";
  }
  const division = mapDivision(c, {
    stateCode,
    statewide: !c.district?.scope && (category === "statewide" || (isMeasure && isStatewideMeasure(c, parsed!, stateCode))),
  });

  const id = stableId(
    "ct",
    election.id,
    division.key,
    // One retention question per judge, often under the same office title.
    normalizeForMatch(isMeasure ? parsed!.identifier || title : retention ? `${title} ${retention.name}` : title),
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

  const choices = isMeasure ? [] : mapCandidates(retention ? [{ name: retention.name }] : (c.candidates ?? []), id, sources, warnings);
  if (!isMeasure && choices.length === 0) {
    warnings.push({ code: "CONTEST_WITHOUT_CHOICES", severity: "warn", contestId: id });
  }

  let measure: Measure | undefined;
  if (isMeasure) {
    measure = mapMeasure(c, parsed!, id, sources);
    if (!measure.title && !measure.identifier) {
      warnings.push({ code: "MEASURE_WITHOUT_TITLE", severity: "warn", contestId: id });
    } else if (!measure.title || !measure.brief) {
      // Provider gave only "Proposition 1"-style naming; the official title and
      // summary must come from the state/county voter guide (durable records).
      warnings.push({ code: "MEASURE_SUMMARY_MISSING", severity: "info", contestId: id });
    }
  }

  return {
    id,
    kind: isMeasure ? "measure" : "candidate",
    contestType,
    rawType: c.type,
    title: title || measure?.identifier || "",
    ballotTitle: c.ballotTitle ?? (retention ? c.referendumTitle : undefined),
    division,
    category,
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

/**
 * A judge's retention question sent as a referendum, in the forms counties
 * and states print it:
 * - "For Associate Justice, Court of Appeal, Fourth District, Division One, LISA RODRIGUEZ" (California)
 * - "Shall Judge Mary Smith of the Missouri Court of Appeals, Western District, be retained in office?"
 * - "Shall Mary Smith be retained as Judge of the District Court?"
 * Returns the office and the judge's name as printed, or null.
 */
export function retentionQuestion(text: string): { office: string; name: string } | null {
  const t = text.replace(/\s+/g, " ").trim();
  const isName = (n: string) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’ -]{2,60}$/.test(n) && n.trim().split(" ").length >= 2 && n.trim().split(" ").length <= 6;
  const judicial = /\b(justice|judge|court)\b/i;
  // "For …" also heads ordinary measures ("For the Court Facilities Bond, Measure C"): the office must name a judge's seat.
  let m = /^for (.+), ([^,]+)$/i.exec(t);
  if (m && /\b(justice|judge)\b/i.test(m[1]) && isName(m[2]) && !/^(measure|proposition|prop|question|issue)\b/i.test(m[2])) {
    return { office: m[1].trim(), name: m[2].trim() };
  }
  m = /^shall (?:(?:chief |associate |presiding )?(?:judge|justice) )?(.+?) (?:of|on) the (.+?),? be retained\b/i.exec(t);
  if (m && judicial.test(m[2]) && isName(m[1])) return { office: m[2].trim(), name: m[1].trim() };
  m = /^shall (.+?) be retained (?:in office )?as (.+?)\??$/i.exec(t);
  if (m && judicial.test(m[2]) && isName(m[1])) return { office: m[2].trim().replace(/^an? /i, ""), name: m[1].trim() };
  return null;
}

function mapContestType(t: string | undefined, isMeasure: boolean): ContestType {
  const v = (t ?? "").trim().toLowerCase();
  if (isMeasure) return "referendum";
  if (v === "general") return "general";
  if (v === "primary") return "primary";
  if (v === "run-off" || v === "runoff") return "runoff";
  if (v.includes("retention")) return "retention";
  return "other";
}

/**
 * VIP feeds often give a statewide measure the voter's county as its
 * district. Treat it as statewide when its identifier is a state-level form
 * ("Proposition 50", "State Question 836", "State Issue 1", "Constitutional
 * Amendment A", "Amendment 2") or its district is the state itself. Numbered
 * "Question"/"Issue"/"Measure" alone stay local: towns and counties number
 * their own.
 */
function isStatewideMeasure(c: CivicContest, parsed: ParsedMeasureTitle, stateCode: string | undefined): boolean {
  if (c.level?.includes("administrativeArea1")) return true;
  const stateName = stateCode ? STATE_NAMES[stateCode.toUpperCase()] : undefined;
  const d = (c.district?.name ?? "").trim().toLowerCase();
  if (stateName && (d === stateName.toLowerCase() || d === `state of ${stateName.toLowerCase()}`)) return true;
  const id = parsed.identifier ?? "";
  const local = /\b(county|city|town|village|borough|parish|charter|local|school|district)\b/i;
  if (parsed.jurisdiction && local.test(parsed.jurisdiction)) return false;
  if (/^(proposition|prop\.?)\s*\d+$/i.test(id)) return true;
  if (/^state\s+(question|issue|measure|proposition)\b/i.test(id)) return true;
  if (/^(constitutional\s+)?amendment\b/i.test(id) && !local.test(c.referendumTitle ?? "")) return true;
  return false;
}

function mapDivision(c: CivicContest, ctx: { stateCode?: string; statewide: boolean }): Division {
  // VIP often labels a statewide contest with the voter's county as its
  // "district". When the office is statewide by title, say so.
  if (ctx.statewide && ctx.stateCode) {
    const code = ctx.stateCode.toUpperCase();
    const ocdId = stateOcdId(code);
    return { key: ocdId, ocdId, name: STATE_NAMES[code] ?? code, scope: "statewide" };
  }
  // Provider district names and ids repeat across states ("State House
  // District 12", "Sheriff"), so every non-OCD key carries the state.
  const st = (ctx.stateCode ?? "us").toLowerCase();
  const d = c.district;
  if (!d) return { key: `${st}:unknown::${normalizeForMatch(c.office ?? c.referendumTitle)}`, name: "" };
  const scope = d.scope?.toLowerCase();
  return {
    key: `${st}:${scope ?? "unknown"}:${d.id ?? ""}:${normalizeForMatch(d.name)}`,
    name: d.name ?? "",
    scope: d.scope,
    districtId: d.id,
  };
}

/** OCD id for a state; DC is a district, not a state, in OCD. */
export function stateOcdId(code: string): string {
  return code.toUpperCase() === "DC" ? "ocd-division/country:us/district:dc" : `ocd-division/country:us/state:${code.toLowerCase()}`;
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

interface ParsedMeasureTitle {
  identifier?: string;
  jurisdiction?: string;
  threshold?: string;
  remainder?: string;
}

/**
 * Split provider measure titles such as
 *   "Proposition 1 (Majority Approval Required)"
 *   "Jefferson Union High School District, Measure M (2/3 Approval Required)"
 *   "San Mateo County Community College District, Measure V (55 Percent Approval Required)"
 *   "Regional Transit Measure (Majority Approval Required)"
 * into identifier / jurisdiction / approval threshold / remaining title.
 * Display text is taken verbatim from these parts — nothing is invented.
 */
export function parseMeasureTitle(raw: string): ParsedMeasureTitle {
  let rest = raw.replace(/\s+/g, " ").trim();
  let threshold: string | undefined;
  const t = /\s*\(([^()]*?)\s+(?:vote\s+)?approval\s+required\)\s*$/i.exec(rest);
  if (t) {
    threshold = t[1].trim();
    rest = rest.slice(0, t.index).trim();
  }
  const withPrefix = new RegExp(`^(.*?),\\s*(${IDENT_SRC})$`, "i").exec(rest);
  if (withPrefix) return { jurisdiction: withPrefix[1].trim(), identifier: withPrefix[2].trim(), threshold };
  const bare = new RegExp(`^(${IDENT_SRC})(?:\\s*[:\\-–—]\\s*(.+))?$`, "i").exec(rest);
  if (bare) return { identifier: bare[1].trim(), remainder: bare[2]?.trim(), threshold };
  return { remainder: rest || undefined, threshold };
}

const IDENT_SRC =
  "(?:state\\s+)?(?:proposition|prop\\.?|measure|question|amendment|issue|initiative|referendum|constitutional amendment|ballot measure)\\s*(?:no\\.?\\s*)?[A-Za-z]{0,3}-?\\d+(?:-\\d+)?[A-Za-z]?|(?:proposition|prop\\.?|measure|question|issue|amendment|constitutional amendment)\\s+[A-Z]{1,3}";

function mapMeasure(c: CivicContest, parsed: ParsedMeasureTitle, contestId: string, sources: SourceRef[]): Measure {
  return {
    id: stableId("ms", contestId),
    identifier: parsed.identifier,
    title: (c.referendumSubtitle || parsed.remainder || "").trim(),
    subtitle: undefined,
    brief: c.referendumBrief,
    text: c.referendumText,
    url: safeUrl(c.referendumUrl),
    responses: c.referendumBallotResponses ?? [],
    passageThreshold: c.referendumPassageThreshold || parsed.threshold,
    effectOfAbstain: c.referendumEffectOfAbstain,
    proStatement: c.referendumProStatement,
    conStatement: c.referendumConStatement,
    sources,
  };
}

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

function stateCode(res: CivicVoterInfoResponse): string | undefined {
  const fromInput = res.normalizedInput?.state?.trim();
  if (fromInput && /^[A-Za-z]{2}$/.test(fromInput)) return fromInput.toUpperCase();
  const name = res.state?.[0]?.name?.trim().toLowerCase();
  return Object.entries(STATE_NAMES).find(([, n]) => n.toLowerCase() === name)?.[0];
}

function coarseLocation(res: CivicVoterInfoResponse, contests: Contest[] = []): CoarseLocation {
  const local = res.state?.[0]?.local_jurisdiction?.name?.trim();
  // VIP sometimes names the local jurisdiction without "County" ("San Mateo").
  // Treat it as a county only when a contest district confirms it.
  const confirmed =
    local &&
    !/county/i.test(local) &&
    contests.some((c) => normalizeForMatch(c.division.name) === normalizeForMatch(`County of ${local}`));
  const zip = /^\d{5}/.exec(res.normalizedInput?.zip ?? "")?.[0];
  return {
    city: res.normalizedInput?.city || undefined,
    state: stateCode(res),
    county: local && /county/i.test(local) ? local : confirmed ? `${local} County` : undefined,
    zip,
  };
}


/** Local election office first; state election office fills missing links. */
function administration(res: CivicVoterInfoResponse): ElectionAdministration | undefined {
  const region = res.state?.[0];
  const local = region?.local_jurisdiction?.electionAdministrationBody;
  const state = region?.electionAdministrationBody;
  if (!local && !state) return undefined;
  return {
    name: region?.local_jurisdiction?.name ?? local?.name ?? state?.name ?? region?.name,
    regionName: region?.name,
    electionInfoUrl: safeUrl(local?.electionInfoUrl) ?? safeUrl(state?.electionInfoUrl),
    ballotInfoUrl: safeUrl(local?.ballotInfoUrl) ?? safeUrl(state?.ballotInfoUrl),
    votingLocationFinderUrl: safeUrl(local?.votingLocationFinderUrl) ?? safeUrl(state?.votingLocationFinderUrl),
    voterLookupUrl:
      safeUrl(local?.electionRegistrationConfirmationUrl) ?? safeUrl(state?.electionRegistrationConfirmationUrl),
  };
}
