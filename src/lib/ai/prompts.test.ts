import { describe, expect, it } from "vitest";
import type { Target } from "@/lib/research/targets";
import { PROMPT_VERSION, RESEARCH_SYSTEM, researchTask, searchTask, SUPPORT_SYSTEM, supportTask } from "./prompts";

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
    }).toMatchSnapshot();
  });

  it("keep the cached instructions free of anything that varies per request", () => {
    expect(RESEARCH_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|\$\{/);
  });

  it("never ask search for Ballotpedia on measures or offices", () => {
    expect(searchTask("measure", "x")).not.toMatch(/ballotpedia/i);
    expect(searchTask("office", "x")).not.toMatch(/ballotpedia/i);
  });
});
