import { describe, expect, it } from "vitest";
import type { ElectionRef } from "@/domain/ballot";
import sample from "../fixture/sample-voterinfo.json";
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
    expect(byTitle("Sample Statewide Measure").category).toBe("measures");
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
    expect(json).not.toContain("00000");
    expect(n.location).toEqual({ city: "Sample City", state: "CA", county: "Sample County" });
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
