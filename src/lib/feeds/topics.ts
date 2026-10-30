/**
 * Topic tags on news cards (owner, 2026-10-30): one or two labels from a fixed
 * list of issues in voters' everyday lives, so a voter sees at a glance what a
 * story is about. Deterministic keyword matching on the headline and excerpt,
 * never AI, never free-form. Labels name a subject only, in plain neutral
 * terms (AP style): no sentiment, framing or rankings. Keywords avoid one
 * side's vocabulary; they only find the subject, and are never displayed.
 *
 * A topic counts when one of its words is in the headline, or appears at least
 * twice in the excerpt; a single passing word in a summary is rarely the story.
 * Pure and unit-tested.
 */

export const NEWS_TOPICS = [
  {
    label: "Economy",
    words: /\b(economy|economic|jobs|unemployment|inflation|wages?|minimum wage|cost of living|small business(es)?|labor unions?|groceries|grocery prices)\b/g,
  },
  {
    label: "Housing",
    words: /\b(housing|homes? prices?|rents?|renters?|rental|evictions?|homeless(ness)?|zoning|mortgages?|landlords?|tenants?)\b/g,
  },
  {
    label: "Health care",
    words: /\b(health ?care|health insurance|medicaid|medicare|affordable care act|obamacare|hospitals?|prescription drugs?|drug prices|mental health|public health|nurses|doctors)\b/g,
  },
  {
    label: "Taxes",
    words: /\b(tax|taxes|taxation|taxpayers?|taxing)\b/g,
  },
  {
    label: "Education",
    // "Electoral college" is about elections, not schools.
    words: /\b(education|schools?|teachers?|students?|classrooms?|universit(y|ies)|tuition|(?<!electoral )colleges?)\b/g,
  },
  {
    label: "Public safety",
    words: /\b(public safety|police|policing|crimes?|criminal|sheriffs?|prosecutors?|firefighters?|shootings?)\b/g,
  },
  {
    label: "Immigration",
    words: /\b(immigration|immigrants?|migrants?|deportations?|deport(ed|ing)?|asylum|refugees?|border security|border crossings?|border wall|southern border|citizenship|visas?)\b/g,
  },
  {
    label: "Insurance",
    words: /\b(insurance|insurers?|insured|uninsured)\b/g,
  },
  {
    label: "Transportation",
    words: /\b(transportation|transit|highways?|freeways?|traffic|commut(e|es|ers?|ing)|railways?|light rail|high speed rail|buses)\b/g,
  },
  {
    label: "Environment",
    words: /\b(environment(al)?|climate|pollution|emissions|clean air|clean water|conservation|wildfires?|droughts?|water supply)\b/g,
  },
  {
    label: "Energy",
    words: /\b(energy|electricity|utility (bills?|rates)|utilities|power grid|gas prices|oil|natural gas|solar|wind power|wind farms?|nuclear power)\b/g,
  },
  {
    label: "Abortion",
    words: /\b(abortions?|roe v wade|reproductive rights|reproductive health)\b/g,
  },
  {
    label: "Guns",
    // Not a bare "gun": "jumped the gun", "under the gun".
    words: /\b(guns|gun (control|rights|violence|laws?|safety|owners?|ownership|polic(y|ies))|firearms?|assault weapons?|concealed carry)\b/g,
  },
  {
    label: "Child care",
    words: /\b(child ?care|day ?care|preschool|pre k)\b/g,
  },
  {
    label: "Social Security",
    words: /\b(social security|pensions?|retirees?)\b/g,
  },
  {
    label: "Veterans",
    words: /\b(veterans?)\b/g,
  },
] as const;

export type NewsTopic = (typeof NEWS_TOPICS)[number]["label"];

const MAX_TOPICS = 2;

/** Lowercased, accents and punctuation folded to spaces, so "high-speed" and "high speed" match alike. */
function fold(s: string | null | undefined): string {
  return ` ${(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")} `;
}

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;

/** Up to two topics for a story, strongest first; ties keep the list's order. */
export function newsTopics(title: string, excerpt?: string | null): NewsTopic[] {
  const t = fold(title);
  const e = fold(excerpt);
  return NEWS_TOPICS.map((topic, i) => {
    const inTitle = count(topic.words, t);
    const inExcerpt = count(topic.words, e);
    return { label: topic.label, i, score: inTitle > 0 || inExcerpt >= 2 ? inTitle * 2 + inExcerpt : 0 };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_TOPICS)
    .map((s) => s.label);
}
