/**
 * The only place model IDs and AI spend settings live
 * (docs/architecture/AI_ARCHITECTURE.md §4). Values come from env so the
 * model, the on/off switch and the monthly budget change without code.
 *
 * Default model: Claude Haiku 5.5 (owner, 2026-10-29). The pipeline only
 * extracts quoted facts from fetched documents; code checks every quote.
 */

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

/** One model at one effort level: a column on the comparison page. */
export interface Setting {
  model: string;
  effort: Effort;
}

export const settingId = (s: Setting) => `${s.model}:${s.effort}`;

/** Every model at every effort (owner, 2026-10-29): the comparison's 9 columns. */
export const DEFAULT_COMPARE: Setting[] = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"].flatMap((model) =>
  (["low", "medium", "high"] as Effort[]).map((effort) => ({ model, effort })),
);

export type ResearchKindKey = "measure" | "profile" | "office";

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
  /** Model for the second "does this quote support this sentence?" pass. */
  checkModel: string;
  /** Monthly budget in USD; runs stop when the month's spend reaches it. */
  monthlyBudgetUsd: number;
  /** Most research jobs running at once across workers. */
  maxInflight: number;
  /** Kept for callers that want "the" model (the measure setting's model). */
  model: string;
}

function parseSetting(raw: string | undefined, fallback: Setting): Setting {
  const [model, effort] = (raw ?? "").trim().split(":");
  if (!model) return fallback;
  return { model, effort: effort === "low" || effort === "high" ? effort : "medium" };
}

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
    compare: compare.length ? compare : DEFAULT_COMPARE,
    publish: {
      measure: parseSetting(env.ANTHROPIC_MODEL_MEASURE, base),
      profile: parseSetting(env.ANTHROPIC_MODEL_PROFILE, base),
      office: parseSetting(env.ANTHROPIC_MODEL_OFFICE, base),
    },
    checkModel: env.ANTHROPIC_MODEL_CHECK?.trim() || env.ANTHROPIC_EXTRACTION_MODEL?.trim() || DEFAULT_MODEL,
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
