/**
 * Keep a typed unit number when a suggestion is picked.
 *
 * Google usually suggests the building ("123 Main St, Daly City, CA 94015,
 * USA"), so picking it would drop the "Apt 4" the voter typed. The unit
 * doesn't change which ballot applies (every unit in a building is in the
 * same districts), but seeing it kept tells the voter we have the right
 * address.
 */

// Unit designators, then an identifier ("Apt 4", "Unit B", "Ste 200", "#12").
// "FL"/"Floor" is left out on purpose: it collides with the Florida abbreviation.
const UNIT =
  /(?:^|[\s,])((?:apt|apartment|unit|ste|suite|bldg|building|rm|room|spc|space|lot|trlr|trailer)(?=[\s.#])\.?\s*#?\s*[a-z0-9][a-z0-9-]{0,7}|#\s*[a-z0-9][a-z0-9-]{0,7})(?=$|[\s,])/i;

/** The unit part of what the voter typed, e.g. "Apt 4", or undefined. */
export function extractUnit(typed: string): string | undefined {
  const m = UNIT.exec(typed);
  return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
}

/**
 * Insert `unit` after the street line of a formatted address, unless the
 * address already carries it. "123 Main St, Daly City, CA 94015, USA" +
 * "Apt 4" → "123 Main St Apt 4, Daly City, CA 94015, USA".
 */
export function withUnit(address: string, unit: string | undefined): string {
  if (!unit) return address;
  const id = (unit.split(/[\s#.]+/).pop() ?? "").toLowerCase();
  const parts = address.split(",");
  if (UNIT.test(parts[0]) && parts[0].toLowerCase().includes(id)) return address;
  parts[0] = `${parts[0].trimEnd()} ${unit}`;
  return parts.join(",");
}
