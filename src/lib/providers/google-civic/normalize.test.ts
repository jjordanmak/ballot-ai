import { describe, expect, it } from "vitest";
import type { Contest, ElectionRef } from "@/domain/ballot";
import sample from "../fixture/sample-voterinfo.json";
import { districtsFrom } from "@/domain/districts";
import { normalizeVoterInfo, safeUrl } from "./normalize";
import type { CivicVoterInfoResponse } from "./types";

const election: ElectionRef = {
  id: "us-2026-11-03-general",
  slug: "2026-11-03",
  name: "General Election",
  date: "2026-11-03",
  externalIds: { "google-civic": "9999" },
};
const T = "2026-10-28T00:00:00.000Z";
const n = normalizeVoterInfo(sample as CivicVoterInfoResponse, election, T);
const byTitle = (t: string) => n.contests.find((c) => c.title.includes(t))!;

describe("normalizeVoterInfo", () => {
  it("keeps every contest, ordered by ballot placement", () => {
    expect(n.contests).toHaveLength(12);
    expect(n.contests[0].title).toBe("U.S. Representative");
    expect(n.contests.at(-1)!.title).toBe("Advisory Question A");
  });

  it("derives categories from scope, roles and levels", () => {
    expect(byTitle("U.S. Representative").category).toBe("federal");
    expect(byTitle("Governor").category).toBe("statewide");
    expect(byTitle("State Assembly").category).toBe("state_legislature");
    expect(byTitle("Supreme Court").category).toBe("judicial");
    expect(byTitle("Board of Supervisors").category).toBe("county");
    expect(byTitle("City Council").category).toBe("city");
    expect(byTitle("School District").category).toBe("education");
    expect(byTitle("Water District").category).toBe("special_district");
    expect(byTitle("Proposition 99").category).toBe("measures");
  });

  it("parses vote-for-N and flags unparseable counts", () => {
    const council = byTitle("City Council");
    expect(council.numberElected).toBe(3);
    expect(council.voteFor).toBe(3);
    const water = byTitle("Water District");
    expect(water.voteFor).toBeUndefined();
    expect(n.warnings).toContainEqual(expect.objectContaining({ code: "NUMBER_PARSE", contestId: water.id }));
  });

  it("preserves official names verbatim and orders candidates", () => {
    const gov = byTitle("Governor");
    expect(gov.choices.map((c) => c.ballotName)).toEqual(["Riley Example", "Casey Fictional"]);
    expect(gov.choices[0].party).toBe("Democratic Party");
  });

  it("drops duplicate candidates with a warning", () => {
    const asm = byTitle("State Assembly");
    expect(asm.choices).toHaveLength(2);
    expect(n.warnings).toContainEqual(expect.objectContaining({ code: "DUPLICATE_CANDIDATE", contestId: asm.id }));
  });

  it("maps retention contests", () => {
    const r = byTitle("Supreme Court");
    expect(r.contestType).toBe("retention");
    expect(r.choices[0].ballotName).toBe("Justice Quinn Sample");
  });

  it("maps referenda to measures with identifiers and threshold", () => {
    const prop = n.contests.find((c) => c.measure?.identifier === "Proposition 99")!;
    expect(prop.kind).toBe("measure");
    expect(prop.measure!.title).toBe("Sample Statewide Measure (fictional)");
    expect(prop.measure!.responses).toEqual(["Yes", "No"]);
    expect(prop.measure!.passageThreshold).toBe("Majority");
  });

  it("drops non-http URLs", () => {
    const z = n.contests.find((c) => c.measure?.identifier === "Measure Z")!;
    expect(z.measure!.url).toBeUndefined();
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://example.org/x")).toBe("https://example.org/x");
  });

  it("degrades unknown contest types into 'other' instead of dropping", () => {
    const adv = byTitle("Advisory Question A");
    expect(adv.contestType).toBe("other");
    expect(n.warnings).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_CONTEST_TYPE", contestId: adv.id }));
  });

  it("flags contests without choices and missing sources", () => {
    const harbor = byTitle("Harbor Commission");
    expect(harbor.choices).toHaveLength(0);
    expect(n.warnings).toContainEqual(expect.objectContaining({ code: "CONTEST_WITHOUT_CHOICES", contestId: harbor.id }));
    const water = byTitle("Water District");
    expect(n.warnings).toContainEqual(expect.objectContaining({ code: "MISSING_SOURCE", contestId: water.id }));
    // The conduit is always recorded as a (non-official) source.
    expect(water.sources.some((s) => s.name === "Google Civic Information API" && !s.official)).toBe(true);
  });

  it("never copies the street address", () => {
    const json = JSON.stringify(n);
    expect(json).not.toContain("1 Sample Way");
    // ZIP is kept as coarse location (PRIVACY.md §2); the street line never is.
    expect(n.location).toEqual({ city: "Sample City", state: "CA", county: "Sample County", zip: "00000" });
  });

  it("produces stable ids and sorted district descriptors", () => {
    const again = normalizeVoterInfo(sample as CivicVoterInfoResponse, election, T);
    expect(again.contests.map((c) => c.id)).toEqual(n.contests.map((c) => c.id));
    expect([...n.districtDescriptors].sort()).toEqual(n.districtDescriptors);
  });

  it("flags an election-date mismatch", () => {
    const other = normalizeVoterInfo(
      { ...(sample as CivicVoterInfoResponse), election: { id: "1", electionDay: "2026-06-02" } },
      election,
      T,
    );
    expect(other.warnings).toContainEqual(expect.objectContaining({ code: "ELECTION_DATE_MISMATCH" }));
  });

  it("drops identical duplicate contests", () => {
    const s = sample as CivicVoterInfoResponse;
    const dup = normalizeVoterInfo({ ...s, contests: [s.contests![1], s.contests![1]] }, election, T);
    expect(dup.contests).toHaveLength(1);
    expect(dup.warnings).toContainEqual(expect.objectContaining({ code: "DUPLICATE_CONTEST" }));
  });

  it("reports unexpected top-level keys as a possible provider shape change", () => {
    const weird = normalizeVoterInfo({ ...(sample as object), newField: 1 } as CivicVoterInfoResponse, election, T);
    expect(weird.warnings).toContainEqual(expect.objectContaining({ code: "PROVIDER_SHAPE_CHANGE" }));
  });
});

// Shape observed in the live 2026-11-03 VIP feed (fictional names/places).
import vip from "../fixture/vip-shaped-voterinfo.json";
import { parseMeasureTitle } from "./normalize";

describe("VIP-shaped feeds", () => {
  const v = normalizeVoterInfo(vip as CivicVoterInfoResponse, election, T);
  const t = (s: string) => v.contests.find((c) => c.title.includes(s))!;

  it("treats 'ballot-measure' contests as measures, not choiceless races", () => {
    const measures = v.contests.filter((c) => c.kind === "measure");
    expect(measures).toHaveLength(6);
    expect(v.warnings.filter((w) => w.code === "CONTEST_WITHOUT_CHOICES")).toHaveLength(0);
    expect(v.warnings.filter((w) => w.code === "UNSUPPORTED_CONTEST_TYPE")).toHaveLength(0);
    expect(measures.every((m) => m.contestType === "referendum" && m.category === "measures")).toBe(true);
  });

  it("parses identifier, jurisdiction and threshold from measure titles", () => {
    expect(parseMeasureTitle("Proposition 1 (Majority Approval Required)")).toEqual({ identifier: "Proposition 1", threshold: "Majority", remainder: undefined });
    expect(parseMeasureTitle("Sample Union High School District, Measure M (2/3 Approval Required)")).toEqual({
      jurisdiction: "Sample Union High School District",
      identifier: "Measure M",
      threshold: "2/3",
    });
    expect(parseMeasureTitle("County of Sample, Measure AA (Majority Approval Required)").identifier).toBe("Measure AA");
    expect(parseMeasureTitle("X District, Measure V (55 Percent Approval Required)").threshold).toBe("55 Percent");
    expect(parseMeasureTitle("Regional Transit Measure (Majority Approval Required)")).toEqual({ remainder: "Regional Transit Measure", threshold: "Majority" });
  });

  it("places statewide offices and propositions in the state, not the voter's county", () => {
    for (const office of ["Governor", "Superintendent of Public Instruction", "State Board of Equalization"]) {
      expect(t(office).category).toBe("statewide");
      expect(t(office).division.name).toBe("California");
    }
    const prop = v.contests.find((c) => c.measure?.identifier === "Proposition 50")!;
    expect(prop.division.key).toBe("ocd-division/country:us/state:ca");
    const local = v.contests.find((c) => c.measure?.identifier === "Measure AA")!;
    expect(local.division.name).toBe("County of Sample");
  });

  it("categorizes scope-less contests by office title", () => {
    expect(t("U.S. Representative").category).toBe("federal");
    expect(t("State Assembly").category).toBe("state_legislature");
    expect(t("City Council").category).toBe("city");
    expect(t("County Board of Education").category).toBe("education");
    expect(t("Board of Supervisors").category).toBe("county");
  });

  it("keeps official names verbatim and reports missing measure summaries as info, not partial", () => {
    expect(t("Governor").choices[0].ballotName).toBe("ALEX EXAMPLE");
    expect(v.warnings.filter((w) => w.code === "MEASURE_SUMMARY_MISSING").every((w) => w.severity === "info")).toBe(true);
    expect(v.administration).toMatchObject({
      name: "Sample",
      electionInfoUrl: "http://example.org/county",
      ballotInfoUrl: "https://example.org/sos/ballot",
      votingLocationFinderUrl: undefined,
    });
  });
});

describe("county from local jurisdiction", () => {
  it("adds 'County' when a contest district confirms the local jurisdiction is a county", () => {
    const v = normalizeVoterInfo(vip as CivicVoterInfoResponse, election, T);
    expect(v.location).toMatchObject({ city: "Sample City", state: "CA", county: "Sample County" });
  });
});

describe("districtsFrom", () => {
  const contest = (title: string) => ({ title }) as Contest;
  it("reads congressional and legislative districts from OCD ids and the BOE district from contest titles", () => {
    const ids = [
      "ocd-division/country:us/state:ca/cd:15",
      "ocd-division/country:us/state:ca/sldl:19",
      "ocd-division/country:us/state:ca/sldu:11",
      "ocd-division/country:us/state:ca/county:san_mateo",
    ];
    const titles = ["Governor", "Member, State Board of Equalization, District 2", "U.S. Representative, District 15"];
    expect(districtsFrom(ids, titles.map(contest)).map((d) => `${d.kind}:${d.number}`)).toEqual([
      "congressional:15",
      "state_lower:19",
      "state_upper:11",
      "board_of_equalization:2",
    ]);
  });
  it("falls back to contest titles when there are no division ids", () => {
    const titles = ["U.S. Representative, District 15", "Member of the State Assembly, District 19"];
    expect(districtsFrom([], titles.map(contest)).map((d) => `${d.kind}:${d.number}`)).toEqual(["congressional:15", "state_lower:19"]);
  });
});
