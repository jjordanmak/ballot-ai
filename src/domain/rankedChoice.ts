import type { Contest } from "./ballot";

/**
 * Contests voted by ranked choice in general elections, by state law or city
 * charter. Ballot data doesn't say so, and "Vote for 1" is wrong marking
 * guidance there. Keep this list to what each election office publishes.
 */
interface RcvRule {
  state: string;
  /** Where it applies; a contest matches when this returns true. */
  applies: (c: Contest) => boolean;
  /** Official election office that documents it. */
  source: string;
}

const STATE_AND_FEDERAL = new Set(["federal", "statewide", "state_legislature"]);
const cityOffice = (place: RegExp) => (c: Contest) =>
  (c.category === "city" || c.category === "county") && place.test(c.division.name);

export const RANKED_CHOICE: RcvRule[] = [
  // Alaska: federal and state offices in the general election (Ballot Measure 2, 2020).
  { state: "AK", applies: (c) => STATE_AND_FEDERAL.has(c.category), source: "Alaska Division of Elections" },
  // Maine: federal offices in the general election.
  { state: "ME", applies: (c) => c.category === "federal", source: "Maine Secretary of State" },
  { state: "CA", applies: cityOffice(/\bSan Francisco\b/i), source: "San Francisco Department of Elections" },
  { state: "CA", applies: cityOffice(/\b(Oakland|Berkeley|San Leandro|Albany)\b/i), source: "Alameda County Registrar of Voters" },
  { state: "OR", applies: cityOffice(/\bPortland\b/i), source: "Multnomah County Elections" },
];

/** The rule that makes this contest ranked-choice, if any. */
export function rankedChoiceRule(c: Contest, state: string | undefined): RcvRule | undefined {
  if (c.kind !== "candidate" || c.contestType === "retention" || !state) return undefined;
  return RANKED_CHOICE.find((r) => r.state === state.toUpperCase() && r.applies(c));
}
