import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { billingPeriod } from "@/lib/usage/quota";

/** The month's Anthropic spend counter, shared with the research job (src/lib/research/run.ts uses the same metric). */
export const SPEND_METRIC = "anthropic.microusd";

type Db = SupabaseClient<Database>;

export async function monthSpendMicroUsd(db: Db, now: Date): Promise<number> {
  const { data } = await db.from("api_usage").select("count").eq("period", billingPeriod(now)).eq("metric", SPEND_METRIC).maybeSingle();
  return data?.count ?? 0;
}

export async function recordSpendMicroUsd(db: Db, now: Date, micro: number) {
  if (micro > 0) await db.rpc("add_api_spend", { p_period: billingPeriod(now), p_metric: SPEND_METRIC, p_amount: micro });
}
