import { describe, expect, it } from "vitest";
import type { ResolvedBallot } from "@/domain/ballot";
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
