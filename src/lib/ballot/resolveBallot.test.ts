import { describe, expect, it, vi } from "vitest";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { FixtureElectionSource } from "./elections";
import { MemoryBallotStore } from "./store";
import { resolveBallotForAddress } from "./resolveBallot";
import type { BallotRuntime } from "./runtime";
import { locationLabel } from "./copy";

function runtime(): BallotRuntime & { store: MemoryBallotStore } {
  return {
    mode: "fixture",
    elections: new FixtureElectionSource(),
    resolver: new FixtureBallotResolver(),
    store: new MemoryBallotStore(),
  };
}

const ADDRESS = "1 Sample Way, Sample City, CA 00000";

describe("resolveBallotForAddress", () => {
  it("stores an address-free ballot under a geography key", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    const out = await resolveBallotForAddress(ADDRESS, rt);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.electionSlug).toBe("2026-11-03");

    const stored = await rt.store.load(out.ballotKey);
    expect(stored?.contests.length).toBe(12);
    const serialized = JSON.stringify(stored) + JSON.stringify(rt.store.events);
    expect(serialized).not.toContain("Sample Way");
    expect(serialized).not.toContain("00000");
    expect(rt.store.events[0]).toMatchObject({ status: "PARTIAL", contestCount: 12, state: "CA" });
  });

  it("gives every household with the same districts the same key", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    const a = await resolveBallotForAddress("1 Sample Way, Sample City", rt);
    const b = await resolveBallotForAddress("99 Other Street, Sample City", rt);
    expect(a.ok && b.ok && a.ballotKey === b.ballotKey).toBe(true);
  });

  it("returns explicit failure statuses without storing anything", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    expect(await resolveBallotForAddress("94015", rt)).toEqual({ ok: false, status: "INVALID_ADDRESS" });
    expect(await resolveBallotForAddress("1 nocoverage Ave", rt)).toEqual({ ok: false, status: "NO_COVERAGE" });
    expect(await resolveBallotForAddress("1 error Ave", rt)).toEqual({ ok: false, status: "PROVIDER_ERROR" });
  });
});

describe("locationLabel", () => {
  it("is coarse and tidy", () => {
    expect(locationLabel({ city: "DALY CITY", state: "CA", county: "San Mateo County" })).toBe("Daly City, CA");
    expect(locationLabel({ county: "San Mateo County", state: "CA" })).toBe("San Mateo County, CA");
  });
});
