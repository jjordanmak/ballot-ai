import { describe, expect, it, vi } from "vitest";
import type { ElectionRef } from "@/domain/ballot";
import type { BallotRuntime } from "@/lib/ballot/runtime";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { parseLocations, runMatrix } from "./matrix";

const election: ElectionRef = { id: "us-2026-11-03-general", slug: "2026-11-03", name: "General Election", date: "2026-11-03", externalIds: {} };

function fakeDb() {
  const inserted: Record<string, unknown>[] = [];
  return { db: { from: () => ({ insert: async (rows: Record<string, unknown>[]) => (inserted.push(...rows), { error: null }) }) }, inserted };
}

describe("parseLocations", () => {
  it("reads the env var's list and drops malformed entries", () => {
    expect(parseLocations('[{"label":"TX · Austin City Hall","address":"301 W 2nd St, Austin, TX 78701"},{"label":1}]')).toEqual([
      { label: "TX · Austin City Hall", address: "301 W 2nd St, Austin, TX 78701" },
    ]);
    expect(parseLocations("not json")).toEqual([]);
    expect(parseLocations(undefined)).toEqual([]);
  });
});

describe("runMatrix", () => {
  it("stores each location's results under its label, never its address", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted } = fakeDb();
    const runtime = { resolver: new FixtureBallotResolver(() => new Date("2026-10-30T00:00:00Z")) } as unknown as BallotRuntime;
    const locations = [
      { label: "CA · Sample City Hall", address: "1 Sample Way, Springfield, CA 99999" },
      { label: "TX · Not found", address: "1 invalid Way, Austin, TX 78701" },
    ];
    const out = await runMatrix({ db: db as never, runtime, election, locations });
    expect(out).toMatchObject({ stored: 2, skipped: 0 });
    const ok = inserted.find((r) => r.label === "CA · Sample City Hall")!;
    expect(ok.contest_count).toBeGreaterThan(0);
    expect(ok.inventory).toMatchObject({ titles: expect.arrayContaining(["Governor"]), candidates: expect.arrayContaining(["Riley Example"]) });
    expect(inserted.find((r) => r.label === "TX · Not found")).toMatchObject({ status: "INVALID_ADDRESS", contest_count: 0 });
    // The addresses never reach storage.
    const stored = JSON.stringify(inserted);
    expect(stored).not.toContain("Sample Way");
    expect(stored).not.toContain("invalid Way");
  });
});
