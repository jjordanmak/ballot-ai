import type { ContestCategory } from "./ballot";

/**
 * Derive a display category from provider-agnostic contest attributes.
 *
 * Inputs mirror the Civic/VIP vocabulary (district scope, office roles,
 * government levels) but are plain strings so other providers can map into
 * them. Unknown combinations land in "other" — never dropped.
 */
export function categorizeContest(input: {
  kind: "candidate" | "measure";
  scope?: string;
  roles?: string[];
  levels?: string[];
  title?: string;
}): ContestCategory {
  const scope = input.scope?.toLowerCase();
  const roles = input.roles ?? [];
  const levels = input.levels ?? [];
  const title = input.title ?? "";

  if (input.kind === "measure") return "measures";
  if (levels.includes("country") || scope === "national" || scope === "congressional") {
    return "federal";
  }
  if (scope === "judicial" || roles.includes("judge") || roles.includes("highestCourtJudge")) {
    return "judicial";
  }
  if (scope === "schoolboard" || roles.includes("schoolBoard") || EDUCATION_TITLE.test(title)) {
    return "education";
  }
  if (scope === "stateupper" || scope === "statelower") return "state_legislature";
  if (scope === "statewide") return "statewide";
  if (scope === "countywide" || scope === "countycouncil") return "county";
  if (scope === "citywide" || scope === "citycouncil" || scope === "ward" || scope === "township") {
    return "city";
  }
  if (scope === "special") return "special_district";

  // Fall back to government level when scope is missing.
  if (levels.includes("administrativeArea1")) return "statewide";
  if (levels.includes("administrativeArea2")) return "county";
  if (levels.includes("locality") || levels.includes("subLocality1") || levels.includes("subLocality2")) {
    return "city";
  }
  if (levels.includes("special") || levels.includes("regional")) return "special_district";
  return "other";
}

const EDUCATION_TITLE = /\b(school|college|education|unified|university)\b/i;

/** Known Civic district scopes; anything else triggers UNKNOWN_DISTRICT_SCOPE. */
export const KNOWN_SCOPES = new Set([
  "statewide",
  "congressional",
  "stateupper",
  "statelower",
  "countywide",
  "judicial",
  "schoolboard",
  "citywide",
  "special",
  "countycouncil",
  "township",
  "ward",
  "citycouncil",
  "national",
]);
