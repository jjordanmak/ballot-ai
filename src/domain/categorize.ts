import type { ContestCategory } from "./ballot";

/**
 * Derive a display category from provider-agnostic contest attributes.
 *
 * Inputs mirror the Civic/VIP vocabulary (district scope, office roles,
 * government levels) but are plain strings so other providers can map into
 * them. Real VIP feeds often omit scope/roles/levels and give a statewide
 * office the voter's county as its "district", so office-title rules run
 * whenever scope is missing. Unknown combinations land in "other" — never
 * dropped.
 */
export function categorizeContest(input: {
  kind: "candidate" | "measure";
  scope?: string;
  roles?: string[];
  levels?: string[];
  title?: string;
  districtName?: string;
}): ContestCategory {
  const scope = input.scope?.toLowerCase();
  const roles = input.roles ?? [];
  const levels = input.levels ?? [];
  const title = input.title ?? "";
  const district = input.districtName ?? "";

  if (input.kind === "measure") return "measures";
  if (levels.includes("country") || scope === "national" || scope === "congressional") {
    return "federal";
  }
  if (scope === "judicial" || roles.includes("judge") || roles.includes("highestCourtJudge")) {
    return "judicial";
  }
  if (scope === "schoolboard" || roles.includes("schoolBoard") || (!scope && EDUCATION_TITLE.test(title) && !STATEWIDE_TITLE.test(title))) {
    return "education";
  }
  if (scope === "stateupper" || scope === "statelower") return "state_legislature";
  if (scope === "statewide") return "statewide";
  if (scope === "countywide" || scope === "countycouncil") return "county";
  if (scope === "citywide" || scope === "citycouncil" || scope === "ward" || scope === "township") {
    return "city";
  }
  if (scope === "special") return "special_district";

  // Scope missing or unrecognized: office title first (it is authoritative for
  // which office this is), then the district name.
  const byTitle = categorizeByTitle(title);
  if (byTitle) return byTitle;

  if (levels.includes("administrativeArea1")) return "statewide";
  if (levels.includes("administrativeArea2")) return "county";
  if (levels.includes("locality") || levels.includes("subLocality1") || levels.includes("subLocality2")) {
    return "city";
  }
  if (levels.includes("special") || levels.includes("regional")) return "special_district";

  if (/^city of\b|\bcity$/i.test(district)) return "city";
  if (/^(county|parish|borough|municipality) of\b|\b(county|parish|borough)$/i.test(district)) return "county";
  if (/\b(water|soil|fire|sanitary|sanitation|hospital|healthcare|park|recreation|transit|utility|irrigation|harbor|port|cemetery|library|mosquito|resource conservation)\b.*\bdistrict\b/i.test(district)) {
    return "special_district";
  }
  return "other";
}

/** Office-title rules. Order matters: more specific offices first. */
export function categorizeByTitle(title: string): ContestCategory | undefined {
  if (FEDERAL_TITLE.test(title)) return "federal";
  if (COURT_CLERK_TITLE.test(title)) return "county";
  if (JUDICIAL_TITLE.test(title)) return "judicial";
  if (STATEWIDE_TITLE.test(title)) return "statewide";
  if (EDUCATION_TITLE.test(title)) return "education";
  if (LEGISLATURE_TITLE.test(title) && !LOCAL_ASSEMBLY.test(title)) return "state_legislature";
  if (COUNTY_TITLE.test(title)) return "county";
  if (CITY_TITLE.test(title)) return "city";
  return undefined;
}

const FEDERAL_TITLE = /^(u\.?\s?s\.?|united states)\s+(representative|senator|senate|house)|^president\b|representative in congress|member of congress|delegate to the (u\.?\s?s\.?|united states) house/i;
/** Court clerks are county offices even though their titles name a court. */
const COURT_CLERK_TITLE = /^clerk of (the )?(circuit|superior|district|county) court/i;
const JUDICIAL_TITLE = /\b(judge|justice|supreme court|court of appeals?|superior court|district court|circuit court)\b/i;
const EDUCATION_TITLE = /\b(school|college|education|unified(?! government)|university)\b/i;
const LEGISLATURE_TITLE =
  /\b(state assembly|assembly member|member of (the )?(state |general )?assembly|state senat(e|or)|house of delegates|state representative|state house|state legislat(or|ure)|member of the legislature|legislative district|(representative|senator) in (the )?general (assembly|court))\b/i;
/** Borough, municipal and city assemblies (e.g. Alaska) are local, not the state legislature. */
const LOCAL_ASSEMBLY = /\b(borough|municipal|municipality|city)\b/i;
/**
 * Statewide executive offices. Generic enough to hold across states; titles
 * that are ambiguous at local level (e.g. "Treasurer") only match when they
 * are the whole title, since county versions carry a county prefix/suffix.
 */
const STATEWIDE_TITLE =
  /^(governor|lieutenant governor|lt\.? governor|governor (and|&|\/) lieutenant governor|secretary of state|secretary of the commonwealth|state controller|controller|state comptroller|comptroller of public accounts|state treasurer|treasurer|treasurer of state|attorney general|insurance commissioner|commissioner of insurance|superintendent of public instruction|state superintendent.*|auditor|state auditor|auditor of state|auditor general|comptroller|chief financial officer|agriculture commissioner|commissioner of agriculture.*|land commissioner|commissioner of (the )?general land office|commissioner of (school and )?public lands|labor commissioner|commissioner of labor.*|state mine inspector|public service commissioner)$|\bstate board of equalization\b|\bpublic service commission\b|\bcorporation commission(er)?\b|\brailroad commission(er)?\b/i;
const COUNTY_TITLE = /\b(board of supervisors|county (supervisor|commissioner|executive|clerk|treasurer|assessor|sheriff|auditor|coroner|board)|sheriff|assessor|district attorney|county\b)/i;
const CITY_TITLE = /\b(city council|council member|councilmember|mayor|city of|town council|village|alderman|alderperson|selectboard|board of aldermen)\b/i;

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

/** USPS state code → name, for statewide division labels. */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
