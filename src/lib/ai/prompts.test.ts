import { describe, expect, it } from "vitest";
import type { Target } from "@/lib/research/targets";
import {
  PROMPT_VERSION,
  RESEARCH_SYSTEM,
  REVIEW_SYSTEM,
  REWRITE_SYSTEM,
  SYNTH_SYSTEM,
  parityTask,
  personListsTask,
  repairTask,
  rescueTask,
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
      searchClaim: searchTask("claim", "1. a"),
    }).toMatchSnapshot();
  });

  // The writing pipeline (WRITING_PIPELINE_PLAN.md): same rule, one snapshot per round's prompts.
  it("synthesis prompts are pinned", () => {
    expect({
      PROMPT_VERSION,
      SYNTH_SYSTEM,
      race: synthesisTask({ ...base, kind: "race", label: "Governor (California)", candidateNames: ["Ann Bee", "Cy Cole"] }),
      measure: synthesisTask(base),
      candidate: synthesisTask({ ...base, kind: "candidate", personName: "Ann Bee", office: "Governor", division: "California" }, ["Member, Springfield City Council (2019–present)"]),
      candidateLists: personListsTask({ ...base, kind: "candidate", personName: "Ann Bee", office: "Governor", division: "California", local: true }),
      retention: synthesisTask({ ...base, kind: "retention", personName: "Ann Bee", office: "Associate Justice", division: "California" }),
      repair: repairTask([{ id: "context.0", text: "a", reasons: ["excerpt not found in its document"] }]),
      rescue: rescueTask([{ id: "context.0", text: "a" }]),
      synthSupport: synthSupportTask('1. Text: a\n   Excerpts: [1] "b"'),
      REVIEW_SYSTEM,
      review: reviewTask("Item: Governor.", [{ id: "context.0", text: "a" }]),
      parity: parityTask("Governor", [{ label: "c1: Ann Bee", units: [{ id: "c1/background.0", text: "a" }] }]),
      REWRITE_SYSTEM,
      rewrite: rewriteTask([{ id: "c1/background.0", text: "a", reason: "r", excerpts: ["e"], peers: ["p"] }]),
    }).toMatchSnapshot();
  });

  it("people take 2 calls: the lists task has the list rules, the writing task gets the checked positions", () => {
    const t = { ...base, kind: "candidate" as const, personName: "Ann Bee", office: "Governor", division: "California" };
    const lists = personListsTask(t);
    expect(lists).toMatch(/Positions: everything they have done in adult life/);
    expect(lists).not.toMatch(/^Platform:/m);
    const writing = synthesisTask(t, ["Member, Springfield City Council (2019–present)"]);
    expect(writing).toContain("P0: Member, Springfield City Council (2019–present)");
    expect(writing).toMatch(/\{\{years:Pn\}\}/);
    expect(writing).not.toMatch(/Positions: everything they have done/);
    expect(synthesisTask(t)).toContain("Checked positions: none.");
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
