import { describe, expect, it } from "vitest";
import type { Contest } from "./ballot";
import { divisionLabel, mapYearNote, splitMapYear } from "./districtMaps";

describe("splitMapYear", () => {
  it("splits the map year off provider district names", () => {
    expect(splitMapYear("19th Assembly District - 2022")).toEqual({ name: "19th Assembly District", mapYear: "2022" });
    expect(splitMapYear("15th Congressional District - 2025")).toEqual({ name: "15th Congressional District", mapYear: "2025" });
    expect(splitMapYear("House District 12 (2024)")).toEqual({ name: "House District 12", mapYear: "2024" });
    expect(splitMapYear("Trustee Area 2 2022")).toEqual({ name: "Trustee Area 2", mapYear: "2022" });
  });

  it("leaves names without a trailing year alone", () => {
    expect(splitMapYear("City of Daly City")).toEqual({ name: "City of Daly City" });
    expect(splitMapYear("2022")).toEqual({ name: "2022" });
    expect(splitMapYear("Council District 12")).toEqual({ name: "Council District 12" });
  });
});

describe("mapYearNote", () => {
  it("explains California's 2021 commission maps, with no end date", () => {
    const n = mapYearNote("2022", "CA", "state_lower");
    expect(n.text).toMatch(/Citizens Redistricting Commission/);
    expect(n.text).toMatch(/December 27, 2021/);
    expect(n.text).not.toMatch(/Used through/);
    expect(n.source?.url).toMatch(/^https:\/\//);
  });

  it("gives the Prop 50 congressional map its end date", () => {
    const n = mapYearNote("2025", "CA", "congressional");
    expect(n.text).toMatch(/Proposition 50/);
    expect(n.text).toMatch(/Used through the 2030 election\.$/);
    expect(n.source?.url).toBe("https://voterguide.sos.ca.gov/proposition/50");
  });

  it("says only what the data says for a year it can't verify", () => {
    expect(mapYearNote("2022", "TX", "state_lower")).toEqual({ text: "District lines from the map labeled 2022 in the official ballot data." });
    // Local maps aren't the commission's, even in California.
    expect(mapYearNote("2022", "CA", undefined).source).toBeUndefined();
  });
});

describe("divisionLabel", () => {
  const contest = (title: string, name: string, scope?: string) =>
    ({ title, division: { name, scope }, category: "state_legislature" }) as unknown as Contest;

  it("drops the year from the name and keeps a note", () => {
    const l = divisionLabel(contest("Member of the State Assembly, District 19", "19th Assembly District - 2022", "stateLower"), "CA");
    expect(l.jurisdiction).toBe("19th Assembly District");
    expect(l.jurisdictionNote?.text).toMatch(/Commission/);
  });

  it("works for a non-CA district with the generic note", () => {
    const l = divisionLabel(contest("State Representative, District 41", "41st State House District - 2022", "stateLower"), "OH");
    expect(l.jurisdiction).toBe("41st State House District");
    expect(l.jurisdictionNote?.text).toBe("District lines from the map labeled 2022 in the official ballot data.");
  });
});
