/**
 * `?preview=<setting>` (WRITING_PIPELINE_PLAN.md, Steps 5): on preview
 * deployments and locally, the real ballot page renders one writing round's
 * held results in place of the published ones. Production ignores it. The
 * URL carries only the stored ballot key and the setting, never an address.
 * Pure.
 */
import { isSettingId } from "@/lib/ai/config";

/** The setting to preview, or null (production, absent or malformed). */
export function previewSetting(raw: string | string[] | undefined, env: string | undefined = process.env.VERCEL_ENV): string | null {
  if (env === "production") return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && isSettingId(v) ? v : null;
}

/** The held rows' field names for one setting (compare mode stores `<field>@<setting>`). */
export const previewFields = (setting: string) => ["measure", "profile", "office", "race"].map((f) => `${f}@${setting}`);
