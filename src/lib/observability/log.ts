/**
 * Structured, privacy-safe logging. See docs/architecture/PRIVACY.md.
 *
 * Callers pass an event name plus primitive fields. Every string value is
 * scrubbed for anything that looks like a street address or an API key
 * before it reaches stdout (Vercel logs). Objects are not accepted — that
 * keeps whole provider payloads (which echo the address) out of logs.
 */
type Field = string | number | boolean | null | undefined;

const STREET =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s){0,4}(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|ct|court|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway|sq|square|trl|trail)\b\.?[^,]*/gi;
const KEY_PARAM = /([?&](?:key|address)=)[^&\s]+/gi;
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{20,}/g;

export function redact(s: string): string {
  return s
    .replace(KEY_PARAM, "$1[redacted]")
    .replace(GOOGLE_KEY, "[redacted-key]")
    .replace(STREET, "[redacted address]");
}

export function logEvent(event: string, fields: Record<string, Field> = {}): void {
  const safe: Record<string, Field> = {};
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = typeof v === "string" ? redact(v).slice(0, 500) : v;
  }
  console.log(JSON.stringify({ event, ...safe }));
}
