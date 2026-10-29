/**
 * Automated publish checks. Everything that passes publishes immediately;
 * anything that fails is stored as `held` (never shown, no manual step) so
 * the rules can be audited and tuned.
 */
export type Verdict = { status: "published" } | { status: "held"; reason: string } | { status: "skip" };

const MAX_AGE_DAYS = 14;
const OPINION_TITLE = /^\s*(opinion|editorial|commentary|op-ed|letters?( to the editor)?|column|analysis)\s*[:|–—-]/i;
const OPINION_PATH = /\/(opinion|opinions|editorials?|commentary|letters|op-ed)\//i;
const OPINION_CATEGORY = /^(opinion|editorials?|commentary|op-ed|letters|sponsored|paid content|advertorial|partner content)$/i;

export function checkEntry(e: { title: string; link: string; categories: string[]; published?: Date }, now: Date): Verdict {
  if (!e.published) return { status: "held", reason: "no publish date" };
  const age = now.getTime() - e.published.getTime();
  if (age > MAX_AGE_DAYS * 86_400_000) return { status: "skip" };
  if (age < -3_600_000) return { status: "held", reason: "publish date in the future" };
  if (OPINION_TITLE.test(e.title) || OPINION_PATH.test(e.link) || e.categories.some((c) => OPINION_CATEGORY.test(c.trim()))) {
    return { status: "held", reason: "opinion or sponsored" };
  }
  return { status: "published" };
}
