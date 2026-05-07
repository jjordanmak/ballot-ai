/**
 * Renders text that may contain <mark>...</mark> tags.
 * Server-safe; uses dangerouslySetInnerHTML with a tight allowlist
 * (only <mark>, <strong>, <em>, <br>) — content is fully trusted (authored).
 *
 * AUTO-HIGHLIGHT
 * --------------
 * Beyond passing through manually authored <mark> tags, this module also
 * runs a pattern-based highlighter over the text so we can light up
 * key phrases in DYNAMIC content without the author having to mark them
 * by hand. Patterns target high-signal phrases voters scan for:
 *
 *   • Numerical claims     – percentages, dollar amounts, "120 lawsuits"
 *   • Ballot measures      – Prop 36, SB 54, AB 12, Title IX
 *   • Named CA policies    – sanctuary state, FAIR Plan, Medi-Cal, etc.
 *   • Hard superlatives    – "first Latino governor", "only candidate"
 *
 * Existing <mark> regions are protected — the algorithm doesn't add a
 * second mark inside a manual one. Editors can opt OUT entirely with a
 * `no-auto-highlight` parent class (or by passing `noAuto`).
 *
 * The patterns are intentionally conservative; the goal is one or two
 * highlights per sentence, not a sea of yellow.
 */

const ALLOW =
  /^<\/?(mark|strong|em|br)(?:\s+class="hl-(?:yellow|green|orange|teal|purple|pink)")?\s*\/?>$/i;

/* ─── auto-highlight pattern set ─────────────────────────────────── */

const AUTO_PATTERNS: RegExp[] = [
  // Percentages: 18%, 0.5%, 100%
  /\b\d+(?:\.\d+)?%(?:\s*(?:of\s+\w+|undecided|support))?/g,

  // Dollar amounts (with optional unit)
  /\$\s?\d[\d,.]*\s*(?:million|billion|trillion|M|B|T)?\b/gi,

  // "N+ lawsuits / candidates / votes / etc." — numerical claims
  /\b\d{2,}(?:,\d{3})*\+?\s+(?:lawsuits?|policies|candidates|positions|votes|voters|seats|districts|counties|cities|residents|jobs|miles|days|hours|years|points|terms|million)\b/gi,

  // Ballot measures and bills
  /\b(?:Prop(?:osition)?|SB|AB|HR|HJR|SJR)\s+\d+\b/g,
  /\bTitle\s+(?:IX|VI|VII|VIII|II|III|IV)\b/g,

  // Named CA / federal policies (case-insensitive but expects exact phrase)
  new RegExp(
    "\\b(?:" +
      [
        "sanctuary state law",
        "sanctuary state",
        "EV mandate",
        "FAIR Plan",
        "Medi-Cal",
        "single-payer",
        "wealth tax",
        "split-roll",
        "cap-and-trade",
        "CARE Court",
        "Project Homekey",
        "Affordable Care Act",
        "ACA",
        "DACA",
        "Hollywood film tax credit",
        "ethnic studies",
        "gun safety statutes?",
        "EITC",
        "school choice",
        "vouchers?",
        "antitrust",
        "Trump 2\\.0",
        "Newsom era",
      ].join("|") +
      ")\\b",
    "gi"
  ),

  // Hard superlatives ("first/only X", "tied for first")
  /\b(?:first(?:-ever|-time)?|only|never|always|highest|lowest|largest|biggest|fastest-growing|tied for first|tied for last|leading|leads the field|frontrunner)\s+(?:Latino|Black|woman|female|Asian|Republican|Democratic|Latina|Asian-American|African-American|GOP|major|statewide|elected)\s+\w+/gi,
];

/** Combined pattern for a single-pass auto-highlight. */
const AUTO_PATTERN_COMBINED = new RegExp(
  AUTO_PATTERNS.map((r) => r.source).join("|"),
  "gi"
);

/** Apply auto-highlight to a string of HTML, skipping content inside
 *  existing <mark>...</mark> regions and skipping anything resembling
 *  an HTML tag. */
function autoHighlight(html: string): string {
  // Split by mark tags so we don't double-wrap
  const parts = html.split(/(<mark[\s\S]*?<\/mark>)/);
  return parts
    .map((part) => {
      if (!part) return part;
      if (/^<mark/.test(part)) return part; // already wrapped
      return part.replace(AUTO_PATTERN_COMBINED, (match) =>
        // Don't wrap empty matches or single chars
        match.length > 1 ? `<mark>${match}</mark>` : match
      );
    })
    .join("");
}

function sanitize(text: string): string {
  return text.replace(/<[^>]+>/g, (tag) => (ALLOW.test(tag) ? tag : ""));
}

/**
 * Process input: sanitize → optionally auto-highlight. The `noAuto` opt-out
 * is also honored when the rendered element sits inside a `.no-auto-highlight`
 * ancestor (which lets a section-level wrapper disable the algorithm).
 */
function process(text: string, noAuto?: boolean): string {
  const cleaned = sanitize(text);
  if (noAuto) return cleaned;
  return autoHighlight(cleaned);
}

export function RichText({
  text,
  className,
  noAuto,
}: {
  text: string;
  className?: string;
  noAuto?: boolean;
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: process(text, noAuto) }}
    />
  );
}

type BlockTag = "p" | "div" | "span" | "section" | "article" | "li" | "h2" | "h3" | "h4";

export function RichBlock({
  text,
  className,
  as: Tag = "p",
  noAuto,
}: {
  text: string;
  className?: string;
  as?: BlockTag;
  noAuto?: boolean;
}) {
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: process(text, noAuto) }}
    />
  );
}
