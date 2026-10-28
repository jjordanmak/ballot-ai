/**
 * Monthly caps on paid third-party API calls (docs/infrastructure/ENVIRONMENT.md).
 *
 * Every Places request first takes one unit from the month's budget in
 * Supabase (`consume_api_quota`). When the budget is spent, or the counter
 * can't be reached, the call is skipped: suggestions switch off and typing
 * the address keeps working. Failing closed is what keeps the bill at $0.
 *
 * Defaults equal Google's free 10,000 requests per SKU per month. Every
 * call made with the key goes through this counter (calls made before it
 * existed were entered by hand), so the count matches Google's.
 * To allow paid usage, raise the env vars in Vercel. Set one to 0 to turn
 * that call off.
 */
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/log";

export type QuotaMetric = "places.autocomplete" | "places.details";

const LIMITS: Record<QuotaMetric, { env: string; fallback: number }> = {
  "places.autocomplete": { env: "PLACES_AUTOCOMPLETE_MONTHLY_LIMIT", fallback: 10000 },
  "places.details": { env: "PLACES_DETAILS_MONTHLY_LIMIT", fallback: 10000 },
};

/** The month's limit for a metric: env override if it's a whole number ≥ 0, else the free-tier default. */
export function monthlyLimit(metric: QuotaMetric): number {
  const { env, fallback } = LIMITS[metric];
  const raw = process.env[env];
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : fallback;
}

/** Google bills by calendar month in Pacific time; count the same way. */
export function billingPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Take one unit of this month's budget. False means: don't make the call. */
export async function consumeQuota(metric: QuotaMetric): Promise<boolean> {
  const limit = monthlyLimit(metric);
  if (limit <= 0) return false;
  try {
    const { data, error } = await getSupabaseAdmin().rpc("consume_api_quota", {
      p_period: billingPeriod(),
      p_metric: metric,
      p_limit: limit,
    });
    if (error) {
      logEvent("usage.error", { metric, code: error.code });
      return false;
    }
    if (!data) logEvent("usage.cap_reached", { metric, limit });
    return data === true;
  } catch (e) {
    logEvent("usage.unavailable", { metric, error: e instanceof Error ? e.name : "unknown" });
    return false;
  }
}
