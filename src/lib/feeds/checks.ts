/**
 * Automated publish checks. Everything that passes publishes immediately;
 * anything that fails is stored as `held` (never shown, no manual step) so
 * the rules can be audited and tuned.
 */
export type Verdict = { status: "published" } | { status: "held"; reason: string } | { status: "skip" };

/**
 * Which stories belong to this election (owner, 2026-10-30: all news from the
 * current cycle, not just the last 14 days). `start` is the election's
 * `cycle_start`; a story from before the election year must also be about
 * the campaign, so a 2025 story about someone's work in office stays off.
 */
export interface CycleWindow {
  start: Date;
  electionYearStart: Date;
}

/** The election's own cycle start, else the day after the same date 2 years earlier (the last federal general). */
export function cycleWindow(election: { date: string; cycle_start?: string | null }): CycleWindow {
  const day = new Date(`${election.date}T00:00:00Z`);
  const fallback = new Date(Date.UTC(day.getUTCFullYear() - 2, day.getUTCMonth(), day.getUTCDate() + 1));
  const start = election.cycle_start ? new Date(`${election.cycle_start}T00:00:00Z`) : fallback;
  return { start, electionYearStart: new Date(Date.UTC(day.getUTCFullYear(), 0, 1)) };
}

const CAMPAIGN_WORDS = /\b(campaign\w*|candida\w+|race|running for|runs? for|ran for|election\w*|primary|primaries|ballot|reelection|re-election|announce[sd]? (?:a |his |her |their )?(?:bid|run)|bid for)\b/i;
const OPINION_TITLE = /^\s*(opinion|editorial|commentary|op-ed|letters?( to the editor)?|column|analysis)\s*[:|–—-]/i;
const OPINION_PATH = /\/(opinion|opinions|editorials?|commentary|letters|op-ed)\//i;
const OPINION_CATEGORY = /^(opinion|editorials?|commentary|op-ed|letters|sponsored|paid content|advertorial|partner content)$/i;

export function checkEntry(
  e: { title: string; link: string; categories: string[]; published?: Date; summary?: string },
  now: Date,
  cycle: CycleWindow,
): Verdict {
  if (!e.published) return { status: "held", reason: "no publish date" };
  if (e.published < cycle.start) return { status: "skip" };
  if (e.published < cycle.electionYearStart) {
    const year = String(cycle.electionYearStart.getUTCFullYear());
    const text = `${e.title} ${e.summary ?? ""}`;
    if (!CAMPAIGN_WORDS.test(text) && !text.includes(year)) return { status: "skip" };
  }
  if (e.published.getTime() - now.getTime() > 3_600_000) return { status: "held", reason: "publish date in the future" };
  if (OPINION_TITLE.test(e.title) || OPINION_PATH.test(e.link) || e.categories.some((c) => OPINION_CATEGORY.test(c.trim()))) {
    return { status: "held", reason: "opinion or sponsored" };
  }
  return { status: "published" };
}
