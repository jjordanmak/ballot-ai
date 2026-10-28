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

/** Parse a provider integer-ish string. Returns undefined for absent, null for invalid. */
export function parseCount(raw: string | number | undefined | null): number | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
