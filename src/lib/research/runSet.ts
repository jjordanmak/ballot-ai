/**
 * Run sets: the items a writing round (or the model comparison) runs, by
 * durable ids only. The round file (src/data/research/round.json) names one;
 * the Daly City comparison set stays for the final model comparison
 * (WRITING_PIPELINE_PLAN.md, Steps). No addresses. Pure.
 */
import compareSet from "@/data/research/compare-set.json";
import placentia from "@/data/research/run-sets/placentia-92870.json";
import type { CompareTarget } from "./compareReview";

export interface RunSet {
  ballot: string;
  targets: CompareTarget[];
}

const SETS: Record<string, RunSet> = {
  "daly-city-compare": compareSet as RunSet,
  "placentia-92870": placentia as RunSet,
};

export const RUN_SET_NAMES = Object.keys(SETS);

/** The named run set (unknown names fall back to the comparison set). */
export function runSet(name: string): RunSet {
  return SETS[name] ?? SETS["daly-city-compare"];
}

/** A contest as the run-set export lists it (stored ballot contests plus candidate names). */
export interface RunSetContest {
  durableId: string;
  kind: "candidate" | "measure";
  contestType?: string;
  title: string;
  choices?: { durableId: string; name: string }[];
}

/** Every race intro, candidate, judge and measure on a ballot, in ballot order: what a writing round runs. */
export function runSetFor(ballot: string, contests: RunSetContest[]): RunSet {
  const measures: CompareTarget[] = [];
  const races: CompareTarget[] = [];
  const people: CompareTarget[] = [];
  const judges: CompareTarget[] = [];
  for (const c of contests) {
    if (c.kind === "measure") {
      measures.push({ key: `measure:${c.durableId}:measure`, kind: "measure", label: c.title, group: "Measures" });
      continue;
    }
    const choices = [...(c.choices ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    if (c.contestType === "retention") {
      for (const ch of choices) judges.push({ key: `candidate:${ch.durableId}:profile`, kind: "retention", label: `${ch.name} — ${c.title}`, group: "Judges" });
      continue;
    }
    if (!choices.length) continue;
    races.push({ key: `race:${c.durableId}:race`, kind: "race", label: c.title, group: "Race intros" });
    for (const ch of choices) people.push({ key: `candidate:${ch.durableId}:profile`, kind: "candidate", label: `${ch.name} — ${c.title}`, group: "Candidates" });
  }
  return { ballot, targets: [...measures, ...races, ...people, ...judges] };
}
