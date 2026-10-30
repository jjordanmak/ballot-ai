import { describe, expect, it } from "vitest";
import { buildTargets, countyFor, measureNumber, officeKeyFor, taskFor, type ContestRow } from "./targets";

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

  it("local measures read the county's official page (PDFs allowed) and search .gov, never Ballotpedia", () => {
    const [t] = buildTargets([row({ kind: "measure", title: "Measure Z", division_key: "ca:city:daly-city", divisions: { name: "City of Daly City", state: "CA", scope: "citywide" } })]);
    expect(t.pages).toEqual([expect.objectContaining({ url: "https://smcacre.gov/november-3-2026", official: true, allowPdf: true })]);
    expect(t.search).toMatchObject({ kind: "measure" });
    expect(t.search!.query).toMatch(/Measure Z/);
    expect(t.focus).toContain("Measure Z");
  });

  it("a state with no guide yet still gets a .gov search for its measures (not California-only)", () => {
    const [t] = buildTargets([row({ kind: "measure", title: "State Issue 1", division_key: "ocd-division/country:us/state:oh", divisions: { name: "Ohio", state: "OH", scope: "statewide" } })]);
    expect(t.pages).toEqual([]);
    expect(t.search).toMatchObject({ kind: "measure" });
    expect(t.state).toBe("OH");
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

  it("gives statewide candidates their official statement and campaign site, searches for every candidate, and orders measures first", () => {
    const targets = buildTargets([
      row({ contest_candidates: [{ id: "k2", ballot_name: "A B", display_name: null, campaign_url: "https://example.org" }, { id: "k3", ballot_name: "C D", display_name: null, campaign_url: null }] }),
      row({ id: "m1", kind: "measure", title: "Proposition 1" }),
    ]);
    expect(targets.map((t) => t.kind)).toEqual(["measure", "candidate", "candidate", "office"]);
    const [, withSite, without] = targets;
    expect(withSite.pages[0]).toMatchObject({ url: expect.stringMatching(/^https:\/\/voterguide\.sos\.ca\.gov\/candidates\//), official: true });
    expect(withSite.pages[1]).toEqual({ url: "https://example.org", official: false });
    expect(without.pages).toHaveLength(1);
    // Parity: both get the same search, which must name them.
    expect(withSite.search).toMatchObject({ kind: "person", mustMention: ["B"] });
    expect(without.search).toMatchObject({ kind: "person", mustMention: ["D"] });
    expect(targets[3]).toMatchObject({ targetType: "contest", targetId: "ca|governor|california", search: { kind: "office" } });
  });

  it("one office description per office and place, shared across districts", () => {
    const assembly = (n: number) =>
      row({ id: `a${n}`, title: `State Assembly, District ${n}`, division_key: `ocd-division/country:us/state:ca/sldl:${n}`, divisions: { name: `Assembly District ${n}`, state: "CA", scope: "stateLower" } });
    const offices = buildTargets([assembly(19), assembly(21)]).filter((t) => t.kind === "office");
    expect(offices.map((t) => t.targetId)).toEqual(["ca|state assembly|california"]);
  });

  it("builds instructions from stored entities only", () => {
    const [t] = buildTargets([row({ contest_candidates: [{ id: "k2", ballot_name: "A B", display_name: "Ann Bee", campaign_url: "https://example.org" }] })]);
    const task = taskFor(t);
    expect(task.startsWith("Candidate: Ann Bee, running for Governor (California).\n")).toBe(true);
    expect(task).toMatch(/use only passages about Ann Bee/);
    expect(task).toMatch(/Says they will/);
  });
});

describe("countyFor", () => {
  it("places each registry division with its own county, never a neighbor's", () => {
    const county = (name: string) => countyFor("CA", name)?.name;
    // Orange County (Placentia sample ballot).
    expect(county("Placentia")).toBe("Orange County");
    expect(county("North Orange County Community College District Trustee Area 6")).toBe("Orange County");
    expect(county("Placentia-Yorba Linda Unified School District Trustee Area 5")).toBe("Orange County");
    expect(county("4th Supervisorial District")).toBe("Orange County");
    // San Mateo County (Daly City sample ballot).
    expect(county("City of Daly City")).toBe("San Mateo County");
    expect(county("5th Supervisorial District - 2022")).toBe("San Mateo County");
    expect(county("SMC Community College District Trustee Area 2 - 2022")).toBe("San Mateo County");
    // A bare district from a county we have no entry for stays unplaced.
    expect(county("2nd Supervisorial District")).toBeUndefined();
    expect(county("Trustee Area 3")).toBeUndefined();
    expect(countyFor("TX", "Placentia")).toBeUndefined();
  });
});

describe("officeKeyFor", () => {
  it("drops district numbers and keeps the office's own words", () => {
    expect(officeKeyFor({ title: "Member, Board of Supervisors, District 5", divisionName: "San Mateo County Supervisorial District 5", state: "CA", statewideOrLegislative: false })).toMatchObject({
      key: "ca|member board of supervisors|san mateo county",
      jurisdiction: "San Mateo County",
    });
    expect(
      officeKeyFor({ title: "SMC Community College District, Member, Governing Board, Trustee Area 2", divisionName: "SMC Community College District Trustee Area 2", state: "CA", statewideOrLegislative: false }).key,
    ).toBe("ca|smc community college district member governing board|smc community college district");
  });

  it("works outside California", () => {
    expect(officeKeyFor({ title: "State Representative, District 41", divisionName: "41st State House District", state: "OH", statewideOrLegislative: true }).key).toBe("oh|state representative|ohio");
    expect(officeKeyFor({ title: "County Commissioner", divisionName: "Franklin County", state: "OH", statewideOrLegislative: false }).key).toBe("oh|county commissioner|franklin county");
  });
});
