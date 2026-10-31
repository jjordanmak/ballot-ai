/**
 * The only place model IDs and AI spend settings live
 * (docs/architecture/AI_ARCHITECTURE.md §4). Values come from env so the
 * model, the on/off switch and the monthly budget change without code.
 *
 * Default model: Claude Haiku 5.5 (owner, 2026-10-29). The pipeline only
 * extracts quoted facts from fetched documents; code checks every quote.
 */

import round from "@/data/research/round.json";

export const DEFAULT_MODEL = "claude-haiku-5-5";

/** USD per million tokens, for the in-app spend counter. Unknown models are priced high so the budget stops early. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Prompts of 100K tokens or fewer; the pipeline keeps every prompt under that.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const FALLBACK_PRICE = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

export type Effort = "low" | "medium" | "high";

/** One model at one effort level (and, for writing rounds, a round tag): a column on the comparison page. */
export interface Setting {
  model: string;
  effort: Effort;
  /** Writing round (WRITING_PIPELINE_PLAN.md), e.g. "r1": each round's results are stored under their own tag. */
  round?: string;
}

export const settingId = (s: Setting) => `${s.model}:${s.effort}${s.round ? `:${s.round}` : ""}`;

const ROUND = /^r\d{1,3}$/;

/** Every model at every effort (owner, 2026-10-29): the first comparison's 9 columns (set AI_COMPARE to run them again). */
export const DEFAULT_COMPARE: Setting[] = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"].flatMap((model) =>
  (["low", "medium", "high"] as Effort[]).map((effort) => ({ model, effort })),
);

export type ResearchKindKey = "measure" | "profile" | "office" | "race";

export interface AiConfig {
  enabled: boolean;
  /**
   * compare (default until the owner picks models): only the comparison
   * set, every setting, results held for review, nothing published.
   * publish: every target, one setting per kind, published when it passes.
   */
  mode: "compare" | "publish";
  compare: Setting[];
  /** Publish mode: the setting per kind of item. */
  publish: Record<ResearchKindKey, Setting>;
  /** The neutrality reviewer (synthesis): Haiku by default (`ANTHROPIC_MODEL_REVIEW`). */
  review: Setting;
  /** The news person check (src/lib/feeds/about.ts): Haiku by default (`ANTHROPIC_MODEL_NEWS`); off with `NEWS_AI_CHECK=off` or no key. */
  news: Setting & { enabled: boolean };
  /** Highlights in synthesized prose (`AI_HIGHLIGHTS=off` strips them at read time). */
  highlights: boolean;
  /** The verifier: "does this follow from its excerpts?" (`ANTHROPIC_MODEL_CHECK`, default Haiku high). */
  checkModel: string;
  checkEffort: Effort;
  /** Compare mode: other checker settings that judge the same claims, for calibration (`AI_CHECK_COMPARE`). */
  checkCompare: Setting[];
  /** Monthly budget in USD; runs stop when the month's spend reaches it. */
  monthlyBudgetUsd: number;
  /** Most research jobs running at once across workers. */
  maxInflight: number;
  /** Kept for callers that want "the" model (the measure setting's model). */
  model: string;
}

/** "model:effort" or "model:effort:r2". */
export function parseSetting(raw: string | undefined, fallback: Setting): Setting {
  const [model, effort, round] = (raw ?? "").trim().split(":");
  if (!model) return fallback;
  return { model, effort: effort === "low" || effort === "high" ? effort : "medium", ...(round && ROUND.test(round) ? { round } : {}) };
}

/** A setting id as it appears in a URL or a field name: model:effort[:round], nothing else. */
export const isSettingId = (raw: string) => /^claude-[a-z0-9-]{1,40}:(low|medium|high)(:r\d{1,3})?$/.test(raw);

/**
 * The writing round (src/data/research/round.json): the run set and the
 * settings compare mode runs. Checked in, so each round ships with the
 * prompts it tests; AI_COMPARE still overrides the settings.
 */
export const ROUND_CONFIG = round as { runSet: string; settings: string[] };

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const base = parseSetting(env.ANTHROPIC_DEFAULT_MODEL, { model: DEFAULT_MODEL, effort: "medium" });
  const budget = Number(env.AI_MONTHLY_BUDGET_USD);
  const compare = (env.AI_COMPARE ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseSetting(x, base));
  const inflight = Number(env.AI_MAX_INFLIGHT);
  return {
    enabled: env.AI_SYNTHESIS_ENABLED === "on" && !!env.ANTHROPIC_API_KEY,
    mode: env.AI_MODE === "publish" ? "publish" : "compare",
    compare: compare.length ? compare : ROUND_CONFIG.settings.map((x) => parseSetting(x, base)),
    publish: {
      measure: parseSetting(env.ANTHROPIC_MODEL_MEASURE, base),
      profile: parseSetting(env.ANTHROPIC_MODEL_PROFILE, base),
      office: parseSetting(env.ANTHROPIC_MODEL_OFFICE, base),
      race: parseSetting(env.ANTHROPIC_MODEL_RACE, base),
    },
    review: parseSetting(env.ANTHROPIC_MODEL_REVIEW, { model: DEFAULT_MODEL, effort: "medium" }),
    news: { ...parseSetting(env.ANTHROPIC_MODEL_NEWS, { model: DEFAULT_MODEL, effort: "medium" }), enabled: env.NEWS_AI_CHECK !== "off" && !!env.ANTHROPIC_API_KEY },
    highlights: env.AI_HIGHLIGHTS !== "off",
    ...(() => {
      // Haiku high by default (owner, 2026-10-30, from the calibration data): Haiku low and Sonnet low rejected plainly
      // supported claims; Haiku high caught a detail Haiku medium let through. A model given without an effort runs high.
      const raw = env.ANTHROPIC_MODEL_CHECK?.trim() || env.ANTHROPIC_EXTRACTION_MODEL?.trim() || DEFAULT_MODEL;
      const check = parseSetting(raw.includes(":") ? raw : `${raw}:high`, { model: DEFAULT_MODEL, effort: "high" });
      return { checkModel: check.model, checkEffort: check.effort };
    })(),
    checkCompare: (env.AI_CHECK_COMPARE ?? "claude-haiku-5-5:high,claude-sonnet-5-5:low")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => parseSetting(x, base)),
    monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : 40,
    maxInflight: Number.isInteger(inflight) && inflight > 0 ? Math.min(inflight, 40) : 12,
    model: base.model,
  };
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Cost of one call in micro-dollars (integer), from the response's usage. */
export function costMicroUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const usd =
    (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.ceil(usd * 1_000_000);
}
