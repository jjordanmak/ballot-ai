import { describe, expect, it } from "vitest";
import type { Contest } from "./ballot";
import { measureVoteNeeded, raceVoteNeeded, thresholdText } from "./voteNeeded";

const measure = (identifier: string, title = "", passageThreshold?: string) =>
  ({ kind: "measure", contestType: "referendum", title: identifier, category: "measures", division: { key: "", name: "" }, choices: [], measure: { identifier, title, passageThreshold, responses: [] } }) as unknown as Contest;
const race = (extra: Partial<Contest> = {}) =>
  ({ kind: "candidate", contestType: "general", title: "Governor", category: "statewide", division: { key: "", name: "" }, choices: [], voteFor: 1, ...extra }) as unknown as Contest;

describe("measureVoteNeeded", () => {
  it("always names the share and what it is a share of", () => {
    expect(measureVoteNeeded(measure("Proposition 2", "Increases State's Rainy Day Fund. Legislative Constitutional Amendment."), "CA", true).text).toBe(
      "More than half of the votes cast on this measure",
    );
    expect(measureVoteNeeded(measure("Measure A", "", "2/3"), "CA", false).text).toBe("Two-thirds (66⅔%) of the votes cast on this measure");
    expect(measureVoteNeeded(measure("Measure B", "", "55 Percent"), "CA", false).text).toBe("55% of the votes cast on this measure");
  });
  it("applies verified state rules for statewide amendments", () => {
    expect(measureVoteNeeded(measure("Amendment 2"), "FL", true).text).toBe("60% of the votes cast on this measure");
    expect(measureVoteNeeded(measure("Amendment 1", "", "Majority"), "WY", true).text).toMatch(/all ballots cast in the election/);
    expect(measureVoteNeeded(measure("Amendment 1"), "FL", true).source?.url).toMatch(/^https:/);
    // An Ohio statewide issue that isn't an amendment: simple majority of votes on it.
    expect(measureVoteNeeded(measure("State Issue 1"), "OH", true).text).toBe("More than half of the votes cast on this measure");
  });
  it("says so when a local measure's threshold isn't in the ballot data", () => {
    expect(measureVoteNeeded(measure("Measure M"), "CA", false)).toMatchObject({ verified: false });
  });
  it("parses common threshold wordings", () => {
    expect(thresholdText("Majority")).toBe("More than half of the votes cast on this measure");
    expect(thresholdText("Two-thirds")).toBe("Two-thirds (66⅔%) of the votes cast on this measure");
    expect(thresholdText("60%")).toBe("60% of the votes cast on this measure");
    expect(thresholdText("something odd")).toBeUndefined();
  });
});

describe("raceVoteNeeded", () => {
  it("covers plurality, runoff states, multi-seat, retention and ranked choice", () => {
    expect(raceVoteNeeded(race(), "CA").text).toBe("Most votes wins");
    expect(raceVoteNeeded(race(), "GA").text).toBe("More than half of the votes, otherwise a runoff");
    expect(raceVoteNeeded(race(), "LA").verified).toBe(false);
    expect(raceVoteNeeded(race({ voteFor: 3, numberElected: 3, category: "city" }), "CA").text).toBe("The top 3 vote-getters win");
    expect(raceVoteNeeded(race({ contestType: "retention", category: "judicial" }), "CA").text).toMatch(/more than half/);
    expect(raceVoteNeeded(race({ contestType: "retention", category: "judicial" }), "IL").text).toMatch(/60%/);
    expect(raceVoteNeeded(race({ category: "federal" }), "AK").text).toBe("A majority after ranked-choice rounds");
  });
});
