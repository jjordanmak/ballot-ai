import { describe, expect, it } from "vitest";
import type { Target } from "@/lib/research/targets";
import {
  PROMPT_VERSION,
  RESEARCH_SYSTEM,
  REVIEW_SYSTEM,
  REWRITE_SYSTEM,
  SYNTH_SYSTEM,
  parityTask,
  repairTask,
  researchTask,
  reviewTask,
  rewriteTask,
  searchTask,
  SUPPORT_SYSTEM,
  supportTask,
  synthesisTask,
  synthSupportTask,
} from "./prompts";

const base: Target = { key: "k", kind: "measure", targetType: "measure", targetId: "m1", field: "measure", label: "Proposition 7 (California)", pages: [], follow: [], focus: [] };

describe("prompts", () => {
  // A wording change must be deliberate: update the snapshot and bump PROMPT_VERSION together.
  it("are pinned", () => {
    expect({
      PROMPT_VERSION,
      RESEARCH_SYSTEM,
      measure: researchTask(base),
      office: researchTask({ ...base, kind: "office", office: "Governor", division: "California" }),
      retention: researchTask({ ...base, kind: "retention", personName: "Ann Bee", office: "Associate Justice", division: "California" }),
      candidate: researchTask({ ...base, kind: "candidate", personName: "Ann Bee", office: "Governor", division: "California" }),
      SUPPORT_SYSTEM,
      support: supportTask("1. Text: a\n   Quote: b"),
      searchPerson: searchTask("person", "Ann Bee Governor"),
      searchMeasure: searchTask("measure", "Measure Z"),
      searchRace: searchTask("race", "Governor California 2026 election"),
    }).toMatchSnapshot();
  });

  // The writing pipeline (WRITING_PIPELINE_PLAN.md): same rule, one snapshot per round's prompts.
  it("synthesis prompts are pinned", () => {
    expect({
      PROMPT_VERSION,
      SYNTH_SYSTEM,
      race: synthesisTask({ ...base, kind: "race", label: "Governor (California)", candidateNames: ["Ann Bee", "Cy Cole"] }),
      measure: synthesisTask(base),
      candidate: synthesisTask({ ...base, kind: "candidate", personName: "Ann Bee", office: "Governor", division: "California" }),
      retention: synthesisTask({ ...base, kind: "retention", personName: "Ann Bee", office: "Associate Justice", division: "California" }),
      repair: repairTask([{ id: "context.0", text: "a", reasons: ["excerpt not found in its document"] }]),
      synthSupport: synthSupportTask('1. Text: a\n   Excerpts: [1] "b"'),
      REVIEW_SYSTEM,
      review: reviewTask("Item: Governor.", [{ id: "context.0", text: "a" }]),
      parity: parityTask("Governor", [{ label: "c1: Ann Bee", units: [{ id: "c1/background.0", text: "a" }] }]),
      REWRITE_SYSTEM,
      rewrite: rewriteTask([{ id: "c1/background.0", text: "a", reason: "r", excerpts: ["e"], peers: ["p"] }]),
    }).toMatchSnapshot();
  });

  it("people's writing task drops the old 'Platform' rule (priorities replace it) and keeps the list rules", () => {
    const t = synthesisTask({ ...base, kind: "candidate", personName: "Ann Bee", office: "Governor", division: "California" });
    expect(t).not.toMatch(/^Platform:/m);
    expect(t).toMatch(/Positions: everything they have done in adult life/);
    expect(t).toMatch(/\{\{years:Pn\}\}/);
  });

  it("keep the cached instructions free of anything that varies per request", () => {
    expect(RESEARCH_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|\$\{/);
    expect(SYNTH_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|\$\{/);
  });

  it("never ask search for Ballotpedia on measures or offices", () => {
    expect(searchTask("measure", "x")).not.toMatch(/ballotpedia/i);
    expect(searchTask("office", "x")).not.toMatch(/ballotpedia/i);
  });
});
