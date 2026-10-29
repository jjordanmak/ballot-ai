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

export interface AiConfig {
  enabled: boolean;
  model: string;
  /** Model for the second "does this quote support this sentence?" pass. */
  checkModel: string;
  /** Monthly budget in USD; runs stop when the month's spend reaches it. */
  monthlyBudgetUsd: number;
}

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const model = env.ANTHROPIC_DEFAULT_MODEL?.trim() || DEFAULT_MODEL;
  const budget = Number(env.AI_MONTHLY_BUDGET_USD);
  return {
    enabled: env.AI_SYNTHESIS_ENABLED === "on" && !!env.ANTHROPIC_API_KEY,
    model,
    checkModel: env.ANTHROPIC_EXTRACTION_MODEL?.trim() || model,
    monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : 40,
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
