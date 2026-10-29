import "server-only";
import { logEvent } from "@/lib/observability/log";
import { formatElectionDate } from "./copy";
import { getBallotRuntime } from "./runtime";

export interface ElectionChoice {
  slug: string;
  label: string;
}

/** Elections the address form offers, soonest first (empty if they can't be read; the server then uses the next one). */
export async function electionChoices(): Promise<ElectionChoice[]> {
  try {
    const all = await getBallotRuntime().elections.selectable();
    return all.map((e) => ({ slug: e.slug, label: `${e.name} · ${formatElectionDate(e.date)}` }));
  } catch (e) {
    logEvent("elections.choices_failed", { error: e instanceof Error ? e.message : "unknown" });
    return [];
  }
}
