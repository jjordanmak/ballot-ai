/**
 * Matching-only normalization. NEVER use the result for display — official
 * names and titles are always rendered verbatim.
 */
export function normalizeForMatch(s: string | undefined | null): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Readable form of an ALL-CAPS ballot name ("DONALD P. (DON) WAGNER" →
 * "Donald P. (Don) Wagner"). A fallback only: an official proper-case name
 * from enrichment always wins, and the verbatim ballot name stays visible
 * on the profile. Names already in mixed case are returned unchanged.
 */
export function readableName(raw: string): string {
  if (/\p{Ll}/u.test(raw)) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|[\s\-'’(.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(Mc)(\p{L})/gu, (_, mc: string, ch: string) => mc + ch.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, (s) => s.toUpperCase());
}

/** Parse a provider integer-ish string. Returns undefined for absent, null for invalid. */
export function parseCount(raw: string | number | undefined | null): number | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
