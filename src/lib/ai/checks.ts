/**
 * Checks every AI answer must pass before it is published
 * (docs/architecture/AI_ARCHITECTURE.md §2–3). Pure functions; no I/O.
 */

/** Text compared loosely: same words in the same order, ignoring case, spacing, quote styles and dashes. */
export function normalizeForQuote(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The quote is long enough to mean something and appears in the document. "…" splits a quote into parts that must each appear, in order. */
export function quoteFound(quote: string, documentText: string): boolean {
  const doc = normalizeForQuote(documentText);
  const parts = quote.split(/\s*(?:\.\.\.|…)\s*/).map(normalizeForQuote).filter(Boolean);
  if (!parts.length || parts.join(" ").length < 15) return false;
  let from = 0;
  for (const p of parts) {
    const at = doc.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

/**
 * Wording ballot.ai never publishes in its own voice: rankings, advice,
 * predictions, judgments. Quotes are exempt (they are the source's words);
 * this runs on the summary text only.
 */
const BANNED: { re: RegExp; reason: string }[] = [
  { re: /\b(you|voters?) (should|must|ought to)\b/i, reason: "advice" },
  { re: /\b(vote|voting) (yes|no) (on|for)\b|\b(we|ballot\.ai) recommends?\b|\bendorse(s|d)? by ballot\.ai\b/i, reason: "advice" },
  { re: /\b(best|worst|strongest|weakest|greatest|leading|frontrunner|front-runner)\b/i, reason: "ranking" },
  { re: /\b(will|is likely to|is expected to|probably) (win|lose|pass|fail)\b/i, reason: "prediction" },
  { re: /\b(controversial|radical|extreme|dangerous|reckless|common-?sense|commonsense|disastrous|excellent|terrible|brilliant|failed|misguided|wasteful|bold|visionary)\b/i, reason: "judgment" },
  // The June prototype's framing (WRITING_PIPELINE_PLAN.md): momentum and faction words. "Establishment of a fund" is fine.
  { re: /\b(surged|surging|fractured|aggressively|elites?)\b|\b(anti-)?establishment\b(?!\s+of\b)/i, reason: "judgment" },
  { re: /\bcritics (say|argue|claim)\b/i, reason: "unnamed critics" },
  { re: /\b(unfortunately|fortunately|clearly|obviously|of course)\b/i, reason: "editorializing" },
];

export function neutralityProblem(text: string): string | null {
  for (const b of BANNED) if (b.re.test(text)) return b.reason;
  return null;
}

/** Only these tags survive (matches the page's highlighter); anything else is stripped. */
export function cleanText(s: string, max: number): string {
  return s
    .replace(/<(?!\/?mark>)[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
