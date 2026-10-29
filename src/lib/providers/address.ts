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
  "West Virginia","Wisconsin","Wyoming","Puerto Rico","Guam",
];
const STATE_AT_END = new RegExp(`(?:^|[\\s,])(?:${STATES.join("|")})\\.?$`, "i");
const COUNTRY_SUFFIX = /[,\s]*(?:usa|u\.s\.a?\.?|us|united states(?: of america)?)\.?$/i;
// A ZIP after the street (not the leading house number).
const ZIP = /\s\d{5}(?:-\d{4})?(?=$|[\s,])/;

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

  /**
   * True when the address names its ZIP code, or its city and state
   * ("…, Daly City, CA"). Without them the ballot provider silently guesses
   * a location ("1 Main St" → Dallas, "100 Main St, CA" → Los Angeles), so
   * we ask for the full address instead of risking someone else's ballot.
   * Addresses picked from the suggestions always include all three.
   */
  hasLocality(): boolean {
    const s = this.#raw.replace(COUNTRY_SUFFIX, "").trim();
    if (ZIP.test(s)) return true;
    if (!STATE_AT_END.test(s)) return false;
    // City and state need their own place after the street: "Street, City, ST" or "Street, City ST".
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const cityBeforeState = last.replace(STATE_AT_END, "").trim().length > 0;
    return parts.length >= 3 || (parts.length === 2 && cityBeforeState);
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
