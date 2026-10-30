import { describe, expect, it, vi } from "vitest";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { NoDurableRegistry } from "./durable";
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
    durable: new NoDurableRegistry(),
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
    // The 5-digit ZIP is coarse location (shown on the page); the street never is.
    expect(stored?.location.zip).toBe("00000");
    expect(rt.store.events[0]).toMatchObject({ status: "PARTIAL", contestCount: 12, state: "CA" });
  });

  it("gives every household with the same districts the same key", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    const a = await resolveBallotForAddress("1 Sample Way, Sample City, CA", rt);
    const b = await resolveBallotForAddress("99 Other Street, Sample City, CA", rt);
    expect(a.ok && b.ok && a.ballotKey === b.ballotKey).toBe(true);
  });

  it("returns explicit failure statuses without storing anything", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    expect(await resolveBallotForAddress("94015", rt)).toEqual({ ok: false, status: "INVALID_ADDRESS" });
    expect(await resolveBallotForAddress("1 nocoverage Ave, Sample City, CA", rt)).toMatchObject({ ok: false, status: "NO_COVERAGE" });
    // Not found vs. found-but-not-published: only the second knows the state.
    expect(await resolveBallotForAddress("1 nocoverage Ave, Sample City, CA", rt)).toMatchObject({ located: false });
    expect(await resolveBallotForAddress("1 unpublished Ave, Sample City, CA", rt)).toMatchObject({ ok: false, status: "NO_COVERAGE", located: true });
    expect(await resolveBallotForAddress("1 error Ave, Sample City, CA", rt)).toMatchObject({ ok: false, status: "PROVIDER_ERROR" });
  });

  it("asks for the full address instead of letting the provider guess when there's no ZIP or city and state", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const rt = runtime();
    const resolve = vi.spyOn(rt.resolver, "resolveBallot");
    for (const partial of ["1 Main St", "1 Main St, Daly City", "100 Main St, CA", "123 Main St Daly City CA"]) {
      expect(await resolveBallotForAddress(partial, rt)).toEqual({ ok: false, status: "INVALID_ADDRESS", incomplete: true });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("passes the state's official voter lookup back when there's no ballot, for the cross-street handoff", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await resolveBallotForAddress("Main St and nocoverage Ave, Sample City, CA", runtime());
    expect(out).toMatchObject({ ok: false, status: "NO_COVERAGE", administration: { voterLookupUrl: "https://example.org/voter-lookup" } });
  });
});

describe("locationLabel", () => {
  it("is coarse and tidy", () => {
    expect(locationLabel({ city: "DALY CITY", state: "CA", county: "San Mateo County" })).toBe("Daly City, CA");
    expect(locationLabel({ county: "San Mateo County", state: "CA" })).toBe("San Mateo County, CA");
  });
});
