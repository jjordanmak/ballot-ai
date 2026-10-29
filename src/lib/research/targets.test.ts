import { describe, expect, it } from "vitest";
import { buildTargets, measureNumber, taskFor, type ContestRow } from "./targets";

const row = (over: Partial<ContestRow>): ContestRow => ({
  id: "c1",
  kind: "candidate",
  contest_type: "general",
  title: "Governor",
  division_key: "ocd-division/country:us/state:ca",
  divisions: { name: "California", state: "CA", scope: "statewide" },
  contest_candidates: [],
  ...over,
});

describe("measureNumber", () => {
  it("reads the number from common measure titles", () => {
    expect(measureNumber("Proposition 50")).toBe("50");
    expect(measureNumber("State Issue 1")).toBe("1");
    expect(measureNumber("Amendment 3")).toBe("3");
    expect(measureNumber("Measure Z")).toBeUndefined();
  });
});

describe("buildTargets", () => {
  it("points a California statewide proposition at the official voter guide", () => {
    const [t] = buildTargets([row({ id: "m1", kind: "measure", contest_type: "referendum", title: "Proposition 2" })]);
    expect(t.kind).toBe("measure");
    expect(t.pages.map((p) => p.url)).toContain("https://voterguide.sos.ca.gov/propositions/2/");
    expect(t.pages.every((p) => p.official)).toBe(true);
  });

  it("skips measures with no official list (local, or a state not added yet)", () => {
    expect(buildTargets([row({ kind: "measure", title: "Measure Z", division_key: "ca:city:daly-city", divisions: { name: "City of Daly City", state: "CA", scope: "citywide" } })])).toEqual([]);
    expect(
      buildTargets([row({ kind: "measure", title: "State Issue 1", division_key: "ocd-division/country:us/state:oh", divisions: { name: "Ohio", state: "OH", scope: "statewide" } })]),
    ).toEqual([]);
  });

  it("reads a retention judge from the court's official page", () => {
    const [t] = buildTargets([
      row({
        contest_type: "retention",
        title: "Associate Justice, Court of Appeal, First District, Division 2",
        contest_candidates: [{ id: "k1", ballot_name: "JANE Q JUSTICE", display_name: "Jane Q. Justice", campaign_url: null }],
      }),
    ]);
    expect(t.kind).toBe("retention");
    expect(t.pages[0].url).toMatch(/district1\.htm$/);
    expect(taskFor(t)).toMatch(/Jane Q\. Justice/);
  });

  it("reads a candidate's own campaign site and orders measures first", () => {
    const targets = buildTargets([
      row({ contest_candidates: [{ id: "k2", ballot_name: "A B", display_name: null, campaign_url: "https://example.org" }, { id: "k3", ballot_name: "C D", display_name: null, campaign_url: null }] }),
      row({ id: "m1", kind: "measure", title: "Proposition 1" }),
    ]);
    expect(targets.map((t) => t.kind)).toEqual(["measure", "candidate"]);
    expect(targets[1].pages).toEqual([{ url: "https://example.org", official: false }]);
  });

  it("builds instructions from stored entities only", () => {
    const [t] = buildTargets([row({ contest_candidates: [{ id: "k2", ballot_name: "A B", display_name: "Ann Bee", campaign_url: "https://example.org" }] })]);
    expect(taskFor(t)).toBe(
      "Candidate: Ann Bee, running for Governor (California).\nThe documents are the candidate's own campaign website. Extract facts about this person only: current role, background, past positions, and up to five priorities they state (attribute each: \"Says they will…\").",
    );
  });
});
