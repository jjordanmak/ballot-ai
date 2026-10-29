import { describe, expect, it } from "vitest";
import type { Contest } from "./ballot";
import { rankedChoiceRule } from "./rankedChoice";

const c = (category: string, divisionName = "", extra: Partial<Contest> = {}) =>
  ({ kind: "candidate", contestType: "general", category, division: { key: "", name: divisionName }, ...extra }) as unknown as Contest;

describe("rankedChoiceRule", () => {
  it("covers Alaska state and federal offices and Maine federal offices", () => {
    expect(rankedChoiceRule(c("federal"), "AK")).toBeDefined();
    expect(rankedChoiceRule(c("state_legislature"), "AK")).toBeDefined();
    expect(rankedChoiceRule(c("county", "Kenai Peninsula Borough"), "AK")).toBeUndefined();
    expect(rankedChoiceRule(c("federal"), "ME")).toBeDefined();
    expect(rankedChoiceRule(c("statewide"), "ME")).toBeUndefined();
  });
  it("covers ranked-choice cities only for city offices", () => {
    expect(rankedChoiceRule(c("county", "City and County of San Francisco"), "CA")).toBeDefined();
    expect(rankedChoiceRule(c("city", "City of Daly City"), "CA")).toBeUndefined();
    expect(rankedChoiceRule(c("education", "San Francisco Unified School District"), "CA")).toBeUndefined();
    expect(rankedChoiceRule(c("federal"), "CA")).toBeUndefined();
  });
  it("never applies to retention questions", () => {
    expect(rankedChoiceRule(c("federal", "", { contestType: "retention" }), "AK")).toBeUndefined();
  });
});
