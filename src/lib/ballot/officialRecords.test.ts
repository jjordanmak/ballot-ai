import { describe, expect, it } from "vitest";
import type { ResolvedBallot } from "@/domain/ballot";
import type { ElectionRef } from "@/domain/ballot";
import { normalizeVoterInfo } from "@/lib/providers/google-civic/normalize";
import type { CivicVoterInfoResponse } from "@/lib/providers/google-civic/types";
import { supplementWithOfficialRecords } from "./officialRecords";

function ballot(location: ResolvedBallot["location"], contests: ResolvedBallot["contests"] = []): ResolvedBallot {
  return {
    status: "SUCCESS",
    provider: "google-civic",
    election: { id: "us-2026-11-03-general", slug: "2026-11-03", name: "General Election", date: "2026-11-03", externalIds: {} },
    contests,
    location,
    retrievedAt: "2026-10-28T00:00:00.000Z",
    expiresAt: "2026-10-28T06:00:00.000Z",
    warnings: [],
  };
}

describe("supplementWithOfficialRecords (CA 2026 judicial retention)", () => {
  it("adds Supreme Court + First District retention contests for San Mateo County", () => {
    const b = supplementWithOfficialRecords(ballot({ state: "CA", county: "San Mateo County", city: "Daly City" }));
    const judicial = b.contests.filter((c) => c.category === "judicial");
    expect(judicial).toHaveLength(13);
    expect(judicial.every((c) => c.contestType === "retention" && c.sources[0].official)).toBe(true);
    expect(judicial.map((c) => c.choices[0].ballotName)).toContain("KELLI M. EVANS");
    expect(judicial.map((c) => c.choices[0].ballotName)).toContain("GORDON BURNS");
    expect(b.warnings).toContainEqual(expect.objectContaining({ code: "PROVIDER_GAP", severity: "info" }));
  });

  it("uses each county's own appellate district", () => {
    const la = supplementWithOfficialRecords(ballot({ state: "CA", county: "Los Angeles County" }));
    expect(la.contests.filter((c) => c.division.name.includes("Second Appellate"))).toHaveLength(18);
    expect(la.contests.some((c) => c.division.name.includes("First Appellate"))).toBe(false);
  });

  it("only adds statewide retention when the county is unknown, and warns", () => {
    const b = supplementWithOfficialRecords(ballot({ state: "CA" }));
    expect(b.contests).toHaveLength(2);
    expect(b.warnings.some((w) => w.code === "PROVIDER_GAP" && w.severity === "warn")).toBe(true);
  });

  it("does nothing outside California or when the provider already has the contest", () => {
    expect(supplementWithOfficialRecords(ballot({ state: "NV" })).contests).toHaveLength(0);
    const first = supplementWithOfficialRecords(ballot({ state: "CA", county: "San Mateo County" }));
    const again = supplementWithOfficialRecords(ballot({ state: "CA", county: "San Mateo County" }, first.contests));
    expect(again.contests).toHaveLength(13);
  });
});

describe("supplementWithOfficialRecords with the provider's own retention questions", () => {
  const election: ElectionRef = { id: "us-2026-11-03-general", slug: "2026-11-03", name: "General Election", date: "2026-11-03", externalIds: {} };
  // How Orange County's feed sends them: one referendum per judge, under the county, with no county in the address result.
  const referendum = (title: string) => ({ type: "Referendum", referendumTitle: title, district: { name: "Orange County", scope: "countywide" } });
  const civic = {
    contests: [
      { type: "General", office: "Governor", district: { name: "California", scope: "statewide" }, candidates: [{ name: "Riley Example" }] },
      referendum("For Associate Justice of the Supreme Court, KELLI M. EVANS"),
      referendum("For Associate Justice, Court of Appeal, Fourth District, Division Three, THOMAS A. DELANEY"),
      referendum("For Associate Justice, Court of Appeal, Fourth District, Division One, LISA RODRIGUEZ"),
    ],
  } as unknown as CivicVoterInfoResponse;

  it("treats each referendum-shaped retention question as that judge's retention contest", () => {
    const n = normalizeVoterInfo(civic, election, "2026-10-30T00:00:00.000Z");
    const judges = n.contests.filter((c) => c.contestType === "retention");
    expect(judges.map((c) => [c.kind, c.category, c.title, c.choices[0].ballotName])).toEqual([
      ["candidate", "judicial", "Associate Justice of the Supreme Court", "KELLI M. EVANS"],
      ["candidate", "judicial", "Associate Justice, Court of Appeal, Fourth District, Division Three", "THOMAS A. DELANEY"],
      ["candidate", "judicial", "Associate Justice, Court of Appeal, Fourth District, Division One", "LISA RODRIGUEZ"],
    ]);
    expect(n.contests.some((c) => c.kind === "measure")).toBe(false);
  });

  it("finds the question in whichever field the feed fills, and ignores Yes/No listed as candidates", () => {
    const t = "For Associate Justice, Court of Appeal, Fourth District, Division Three, THOMAS A. DELANEY";
    const shapes = [
      { type: "ballot-measure", referendumTitle: "Judicial", referendumSubtitle: t, district: { name: "Orange County" } },
      { type: "ballot-measure", ballotTitle: t, candidates: [{ name: "Yes" }, { name: "No" }], district: { name: "Orange County" } },
    ];
    for (const c of shapes) {
      const n = normalizeVoterInfo({ contests: [c] } as unknown as CivicVoterInfoResponse, election, "2026-10-30T00:00:00.000Z");
      expect(n.contests.map((x) => [x.kind, x.contestType, x.choices.map((ch) => ch.ballotName)])).toEqual([["candidate", "retention", ["THOMAS A. DELANEY"]]]);
    }
  });

  it("replaces them with the certified contests, places the rest of the court's judges, and adds no duplicates", () => {
    const n = normalizeVoterInfo(civic, election, "2026-10-30T00:00:00.000Z");
    const b = supplementWithOfficialRecords(ballot({ state: "CA", city: "Placentia", zip: "92870" }, n.contests));
    const judges = b.contests.filter((c) => c.category === "judicial");
    // Both Supreme Court justices, and Fourth District judges only where the provider showed them (the county is unknown).
    expect(judges.map((c) => c.choices[0].ballotName).sort()).toEqual(["JOSHUA GROBAN", "KELLI M. EVANS", "LISA RODRIGUEZ", "THOMAS A. DELANEY"]);
    expect(judges.every((c) => c.verification?.status === "verified" && c.division.key.startsWith("ca:court:"))).toBe(true);
    expect(new Set(judges.map((c) => c.id)).size).toBe(4);
    // Same contest id as on any other ballot with that judge.
    const daly = supplementWithOfficialRecords(ballot({ state: "CA", county: "San Mateo County" }));
    expect(daly.contests.find((c) => c.choices[0].ballotName === "KELLI M. EVANS")!.id).toBe(judges.find((c) => c.choices[0].ballotName === "KELLI M. EVANS")!.id);
    // One warning per court, not one per judge.
    expect(b.warnings.filter((w) => w.code === "PROVIDER_GAP" && w.severity === "warn").length).toBeLessThanOrEqual(6);
  });
});

