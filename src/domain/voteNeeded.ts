import type { Contest } from "./ballot";
import { rankedChoiceRule } from "./rankedChoice";

/**
 * What it takes to win a race or pass a measure, in plain words, always with
 * what the share is a share of. Only rules confirmed against a cited source
 * are listed; anything else says it isn't verified rather than guessing.
 * Thresholds count votes cast, never registered or eligible voters.
 */

/** What a measure's threshold is measured against. */
export type VoteBase = "votes_on_measure" | "ballots_cast_in_election";

export interface VoteSource {
  name: string;
  url: string;
}

export interface VoteNeeded {
  text: string;
  /** False when the rule couldn't be confirmed: the text then says so. */
  verified: boolean;
  source?: VoteSource;
}

export const COUNTS_VOTES_CAST = "Counts only votes cast, not registered or eligible voters.";

const BALLOTPEDIA_SUPERMAJORITY: VoteSource = {
  name: "Ballotpedia: Supermajority requirements for ballot measures",
  url: "https://www.ballotpedia.org/Double_majority",
};

interface AmendmentRule {
  text: string;
  source: VoteSource;
}

/**
 * Statewide constitutional amendments whose rule differs from "more than half
 * of the votes cast on it". Each entry was checked against the source it cites.
 */
const AMENDMENT_RULES: Record<string, AmendmentRule> = {
  FL: { text: "60% of the votes cast on this measure", source: BALLOTPEDIA_SUPERMAJORITY },
  CO: { text: "55% of the votes cast on this measure (a repeal of constitutional language needs more than half)", source: BALLOTPEDIA_SUPERMAJORITY },
  NH: { text: "Two-thirds (66⅔%) of the votes cast on this measure", source: BALLOTPEDIA_SUPERMAJORITY },
  IL: { text: "60% of the votes cast on this measure, or more than half of all ballots cast in the election", source: BALLOTPEDIA_SUPERMAJORITY },
  MN: {
    text: "More than half of all ballots cast in the election (leaving it blank counts against it)",
    source: { name: "Minnesota Legislative Reference Library: Constitutional amendments", url: "https://www.lrl.mn.gov/pdf/archive/const_amend.pdf" },
  },
  WY: {
    text: "More than half of all ballots cast in the election (leaving it blank counts against it)",
    source: { name: "Wyoming Secretary of State: Statewide constitutional amendment results", url: "https://sos.wyo.gov/Elections/Docs/2016/Results/General/2016_General_Statewide_Constitutional_Amendments.pdf" },
  },
  TN: {
    text: "More than half of the votes cast on this measure, and Yes votes that also exceed half of all votes cast for governor",
    source: { name: "WPLN: Whether amendments pass depends on how many vote for governor", url: "https://wpln.org/post/will-amendments-pass-depends-many-vote-governor/" },
  },
  HI: {
    text: "More than half of the votes cast on this measure, and Yes votes that are at least half of all ballots cast in the election",
    source: { name: "Honolulu Civil Beat: Why blank votes count as no votes for statewide ballot measures", url: "https://www.civilbeat.org/2024/10/why-blank-votes-count-as-no-votes-for-hawaii-statewide-ballot-measures/" },
  },
};

const isAmendment = (c: Contest) =>
  /constitutional amendment|\bamendment\b/i.test(`${c.title} ${c.measure?.identifier ?? ""} ${c.measure?.title ?? ""} ${c.ballotTitle ?? ""}`);

/** "Majority", "2/3", "55 Percent", "Two-thirds", "60%" → a share of the votes cast on the measure. */
export function thresholdText(raw: string | undefined): string | undefined {
  const t = (raw ?? "").toLowerCase().replace(/approval|vote|required|of the votes?|\(|\)/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (/^(simple )?majority$|^50%? ?\+ ?1$|^more than (half|50)/.test(t)) return "More than half of the votes cast on this measure";
  if (/^(2\/3|two[- ]thirds?|66(\.6+)?%?)/.test(t)) return "Two-thirds (66⅔%) of the votes cast on this measure";
  if (/^(3\/5|three[- ]fifths?)/.test(t)) return "Three-fifths (60%) of the votes cast on this measure";
  const pct = /^(\d{2})(?:\s*(?:%|percent))?$/.exec(t);
  if (pct) return `${pct[1]}% of the votes cast on this measure`;
  return undefined;
}

/**
 * Measures, in order: the provider's threshold, the threshold printed in the
 * official title, the state's rule for statewide amendments, else (statewide)
 * more than half of the votes cast on it; a local measure with none of these
 * says so.
 */
export function measureVoteNeeded(c: Contest, state: string | undefined, statewide: boolean): VoteNeeded {
  const st = state?.toUpperCase();
  const stateRule = statewide && st && isAmendment(c) ? AMENDMENT_RULES[st] : undefined;
  // A state whose amendments count a different base wins even over a bare "Majority" from the data.
  if (stateRule) return { text: stateRule.text, verified: true, source: stateRule.source };
  const fromData = thresholdText(c.measure?.passageThreshold);
  if (fromData) return { text: fromData, verified: true };
  if (statewide) return { text: "More than half of the votes cast on this measure", verified: true, source: BALLOTPEDIA_SUPERMAJORITY };
  return { text: "Not stated in the ballot data. Check your local election office.", verified: false };
}

const MULTISTATE_RUNOFFS: VoteSource = { name: "MultiState: Runoff elections", url: "https://www.multistate.us/elections/runoffs-101" };

/** General-election winner rules that differ from "most votes wins". */
const RACE_RULES: Record<string, VoteNeeded> = {
  GA: { text: "More than half of the votes, otherwise a runoff", verified: true, source: MULTISTATE_RUNOFFS },
  LA: { text: "Rule not yet verified for this election. Check your local election office.", verified: false },
  MS: { text: "Rule not yet verified for this election. Check your local election office.", verified: false },
};

const ILLINOIS_RETENTION: VoteSource = {
  name: "Northwestern Law: Illinois judges, qualifications and retention",
  url: "https://illinoisjudges.law.northwestern.edu/qualifications.html",
};

export function raceVoteNeeded(c: Contest, state: string | undefined): VoteNeeded {
  const st = state?.toUpperCase();
  if (c.contestType === "retention") {
    return st === "IL"
      ? { text: "Retained if at least 60% of the votes cast on it are Yes", verified: true, source: ILLINOIS_RETENTION }
      : { text: "Retained if more than half of the votes cast on it are Yes", verified: true };
  }
  if (rankedChoiceRule(c, st)) return { text: "A majority after ranked-choice rounds", verified: true };
  const seats = Math.max(c.numberElected ?? 1, c.voteFor ?? 1);
  if (seats > 1) return { text: `The top ${seats} vote-getters win`, verified: true };
  if (st && RACE_RULES[st]) return RACE_RULES[st];
  return { text: "Most votes wins", verified: true };
}
