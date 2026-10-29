/**
 * True when an address names its ZIP code, or its city and state
 * ("…, Daly City, CA"). Without them the ballot provider silently guesses a
 * location ("1 Main St" → Dallas, "100 Main St, CA" → Los Angeles), so the
 * form waits for a full address and the server refuses a partial one.
 * Addresses picked from the suggestions always include all three.
 */
export function hasLocality(raw: string): boolean {
  const s = raw.replace(/\s+/g, " ").trim().replace(COUNTRY_SUFFIX, "").trim();
  // A ZIP only counts at the end ("…, CA 94015", "…, MA,02139"); Utah/Idaho
  // grid numbers ("1234 E 10600 S") and PO boxes are not ZIPs.
  if (ZIP_AT_END.test(s) && !/\bbox\s*#?\s*\d{5}(?:-\d{4})?$/i.test(s)) return true;
  if (!STATE_AT_END.test(s)) return false;
  // City and state need their own place after the street: "Street, City, ST",
  // "Street, City ST", or "123 Main St Springfield, IL" (a city after the street type).
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const cityBeforeState = last.replace(STATE_AT_END, "").trim().length > 0;
  if (parts.length >= 3 || (parts.length === 2 && cityBeforeState)) return true;
  return parts.length === 2 && CITY_AFTER_STREET.test(parts[0]);
}

/**
 * Whether input starts like a home street address: a house number,
 * a Wisconsin/Illinois grid number ("N1234 County Rd K"), a spelled-out
 * number ("One Main St"), or Puerto Rico forms ("Urb …", "Carr 1 Km 2.3",
 * "Calle …"). Anything else (cross streets, a place name) gets the
 * official-lookup handoff.
 */
export function startsLikeStreetAddress(raw: string): boolean {
  return /^\s*(\d|[NSEW]\d|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s|urb\.?\s|urbanizaci[oó]n\s|carr\.?\s|carretera\s|calle\s|hc\s?\d|rr\s?\d)/i.test(raw);
}

/**
 * Opaque wrapper for a residential address.
 *
 * The raw value is reachable only through `reveal()`, which provider
 * clients call at the moment they build an upstream request. Accidental
 * logging, JSON serialization, or string interpolation yields a redaction
 * marker instead of the address. See docs/architecture/PRIVACY.md.
 */
const REDACTED = "[redacted address]";

// US states, DC and territories: postal abbreviations and full names.
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI",
  "MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","PR","GU","VI","AS","MP",
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington",
  "West Virginia","Wisconsin","Wyoming","Puerto Rico","Guam","U\\.S\\. Virgin Islands","Virgin Islands","American Samoa",
  "Northern Mariana Islands",
];
const STATE_AT_END = new RegExp(`(?:^|[\\s,])(?:${STATES.join("|")})\\.?$`, "i");
const COUNTRY_SUFFIX = /[,\s]*(?:usa|u\.s\.a?\.?|us|united states(?: of america)?)\.?$/i;
// A ZIP as the last token, after a space or comma (never the leading house number).
const ZIP_AT_END = /[\s,]\d{5}(?:-\d{4})?$/;
// "123 Main St Springfield": a street type followed by more words (the city).
const CITY_AFTER_STREET =
  /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway|pkwy|parkway|cir|circle|ter|terrace|trl|trail|loop|sq|square)\.?\s+[a-z]/i;

export class AddressInput {
  readonly #raw: string;

  private constructor(raw: string) {
    this.#raw = raw;
  }

  /** Returns null when the input can't plausibly be a street address. */
  static parse(input: unknown): AddressInput | null {
    if (typeof input !== "string") return null;
    const raw = input.replace(/\s+/g, " ").trim();
    if (raw.length < 5 || raw.length > 300) return null;
    // Must contain a letter; a bare ZIP is not an address.
    if (!/[a-z]/i.test(raw)) return null;
    return new AddressInput(raw);
  }

  /** See `hasLocality()`. */
  hasLocality(): boolean {
    return hasLocality(this.#raw);
  }

  reveal(): string {
    return this.#raw;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
