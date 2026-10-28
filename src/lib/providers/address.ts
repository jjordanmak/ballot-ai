/**
 * Opaque wrapper for a residential address.
 *
 * The raw value is reachable only through `reveal()`, which provider
 * clients call at the moment they build an upstream request. Accidental
 * logging, JSON serialization, or string interpolation yields a redaction
 * marker instead of the address. See docs/architecture/PRIVACY.md.
 */
const REDACTED = "[redacted address]";

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
