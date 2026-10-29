import type { Contest, DistrictKind, DistrictRef } from "./ballot";

const DISTRICT_ORDER: DistrictKind[] = ["congressional", "state_lower", "state_upper", "board_of_equalization"];

/** States with a single, at-large U.S. House seat. */
export const AT_LARGE_STATES = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);

const SENATE = /\bsenat/i;

/** Which district a contest is for, from its category, division scope and title. */
function contestKind(c: Contest): DistrictKind | undefined {
  const t = c.title ?? "";
  const scope = c.division?.scope?.toLowerCase();
  if (/Board of Equalization/i.test(t)) return "board_of_equalization";
  if (scope === "congressional" || (c.category === "federal" && /represent|congress|house|delegate/i.test(t)) ||
      /\bU\.?\s?S\.?\s+(House|Representative)|United States Representative|Representative in Congress|Member of Congress/i.test(t)) {
    return SENATE.test(t) ? undefined : "congressional";
  }
  const legislative =
    c.category === "state_legislature" || scope === "statelower" || scope === "stateupper" ||
    /State (House|Representative|Senat|Assembly)|Member of (the )?(State )?Assembly|House of Delegates|General Assembly|General Court|Member of the Legislature/i.test(t);
  if (!legislative || /borough|municipal|city/i.test(t)) return undefined;
  return scope === "stateupper" || SENATE.test(t) ? "state_upper" : "state_lower";
}

/** District number as published: "District 12", "12th … District", "District 4A", "Chittenden-6-1". */
function contestNumber(c: Contest): string | undefined {
  const fromTitle = /District\s+(?:No\.?\s*)?([0-9]+[A-Za-z]?|[A-Za-z]+-[0-9A-Za-z-]+)\b/i.exec(c.title ?? "");
  if (fromTitle) return fromTitle[1];
  const name = c.division?.name ?? "";
  return (/\b(\d+)(?:st|nd|rd|th)\b/i.exec(name) ?? /District\s+(?:No\.?\s*)?([0-9]+[A-Za-z]?)\b/i.exec(name))?.[1];
}

/**
 * Districts for the address. Contests on the ballot come first (they are
 * what the voter is voting on, and reflect current maps); OCD division ids
 * (Civic divisionsByAddress) fill in seats with no race on this ballot.
 * At-large congressional seats are "AL".
 */
export function districtsFrom(divisionIds: string[], contests: Contest[], state?: string): DistrictRef[] {
  const found = new Map<DistrictKind, DistrictRef>();
  const add = (kind: DistrictKind, number: string, ocdId?: string) => {
    if (!found.has(kind)) found.set(kind, { kind, number: number.replace(/^0+(?=\d)/, ""), ocdId });
  };
  const st = state?.toUpperCase();
  for (const c of contests) {
    const kind = contestKind(c);
    if (!kind) continue;
    const n = contestNumber(c);
    if (n) add(kind, n);
    else if (kind === "congressional" && st && AT_LARGE_STATES.has(st)) add(kind, "AL");
  }
  for (const id of divisionIds) {
    const m = /\/(cd|sldl|sldu):([^/]+)$/i.exec(id);
    if (!m) continue;
    add(m[1] === "cd" ? "congressional" : m[1] === "sldl" ? "state_lower" : "state_upper", m[2], id);
  }
  return DISTRICT_ORDER.flatMap((k) => (found.has(k) ? [found.get(k)!] : []));
}
