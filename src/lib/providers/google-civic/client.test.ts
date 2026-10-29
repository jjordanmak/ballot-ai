import { describe, expect, it, vi } from "vitest";
import type { ElectionRef } from "@/domain/ballot";
import { AddressInput } from "../address";
import sample from "../fixture/sample-voterinfo.json";
import { GoogleCivicClient, mapCivicError, parseMaxAge } from "./client";
import { GoogleCivicBallotResolver, matchProviderElection } from "./resolver";
import { clampTtl, CACHE_DEFAULT_S, CACHE_MAX_S } from "./status";

const election: ElectionRef = {
  id: "us-2026-11-03-general",
  slug: "2026-11-03",
  name: "General Election",
  date: "2026-11-03",
  externalIds: { "google-civic": "9999" },
};
const addr = AddressInput.parse("1 Sample Way, Sample City, CA")!;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function resolverWith(fetchImpl: typeof fetch) {
  return new GoogleCivicBallotResolver(
    new GoogleCivicClient({ apiKey: "test-key", fetchImpl }),
    () => new Date("2026-10-28T00:00:00Z"),
  );
}

describe("mapCivicError", () => {
  it.each([
    [429, "rateLimitExceeded", "", "RATE_LIMITED"],
    [403, "dailyLimitExceeded", "", "RATE_LIMITED"],
    [500, "backendError", "", "PROVIDER_ERROR"],
    [400, "parseError", "Failed to parse address", "INVALID_ADDRESS"],
    [400, "invalid", "Election unknown", "ELECTION_NOT_FOUND"],
    [400, "invalid", "Address matched multiple locations", "AMBIGUOUS_ADDRESS"],
    [404, "notFound", "No information for this address", "NO_COVERAGE"],
    [404, "notFound", "", "NO_COVERAGE"],
    [418, "", "", "PROVIDER_ERROR"],
  ])("%i %s %s → %s", (status, reason, message, expected) => {
    expect(mapCivicError(status, reason, message)).toBe(expected);
  });
});

describe("cache headers", () => {
  it("parses max-age and clamps TTL", () => {
    expect(parseMaxAge("public, max-age=600")).toBe(600);
    expect(parseMaxAge("no-store")).toBe(0);
    expect(parseMaxAge(null)).toBeUndefined();
    expect(clampTtl(undefined)).toBe(CACHE_DEFAULT_S);
    expect(clampTtl(10 ** 9)).toBe(CACHE_MAX_S);
    expect(clampTtl(0)).toBe(1800);
  });
});

describe("GoogleCivicBallotResolver", () => {
  it("resolves a ballot and never returns an empty ballot as success", async () => {
    const r = await resolverWith(async () => jsonResponse(200, sample, { "cache-control": "max-age=3600" })).resolveBallot(addr, election);
    expect(r.status).toBe("PARTIAL"); // fixture contains a choiceless contest
    expect(r.contests.length).toBe(12);
    expect(r.expiresAt).toBe("2026-10-28T01:00:00.000Z");

    const empty = await resolverWith(async () => jsonResponse(200, { election: sample.election, contests: [] })).resolveBallot(addr, election);
    expect(empty.status).toBe("NO_COVERAGE");
    expect(empty.warnings).toContainEqual(expect.objectContaining({ code: "ZERO_CONTESTS" }));
  });

  it("maps upstream failures to distinct statuses", async () => {
    const rl = await resolverWith(async () => jsonResponse(429, { error: { errors: [{ reason: "rateLimitExceeded" }] } })).resolveBallot(addr, election);
    expect(rl.status).toBe("RATE_LIMITED");
    const bad = await resolverWith(async () => jsonResponse(400, { error: { message: "Failed to parse address", errors: [{ reason: "parseError" }] } })).resolveBallot(addr, election);
    expect(bad.status).toBe("INVALID_ADDRESS");
  });

  it("retries once on 5xx then reports PROVIDER_ERROR", async () => {
    const f = vi.fn(async () => jsonResponse(503, {}));
    const r = await resolverWith(f as unknown as typeof fetch).resolveBallot(addr, election);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("PROVIDER_ERROR");
  });

  it("retries once on network errors", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(200, sample))
      .mockResolvedValueOnce(jsonResponse(200, { divisions: {} }));
    const r = await resolverWith(f as unknown as typeof fetch).resolveBallot(addr, election);
    // voterinfo twice (one retry), then divisionsByAddress once.
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.contests.length).toBeGreaterThan(0);
  });

  it("reports PROVIDER_ERROR when no key is configured", async () => {
    const r = await new GoogleCivicBallotResolver(new GoogleCivicClient({ apiKey: "" })).resolveBallot(addr, election);
    expect(r.status).toBe("PROVIDER_ERROR");
  });

  it("requests with the expected parameters and never logs the address or key", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => void logs.push(String(m)));
    let requested: URL | undefined;
    await resolverWith(async (u) => {
      requested = new URL(String(u));
      return jsonResponse(500, { error: { message: "boom at 1 Sample Way" } });
    }).resolveBallot(addr, election);
    spy.mockRestore();
    expect(requested!.pathname).toBe("/civicinfo/v2/voterinfo");
    expect(requested!.searchParams.get("electionId")).toBe("9999");
    expect(requested!.searchParams.get("returnAllAvailableData")).toBe("true");
    const all = logs.join("\n");
    expect(all).not.toContain("Sample Way");
    expect(all).not.toContain("test-key");
  });
});

describe("matchProviderElection", () => {
  const list = [
    { provider: "google-civic" as const, externalId: "2000", name: "VIP Test Election", date: "2031-06-06", ocdDivisionId: "ocd-division/country:us" },
    { provider: "google-civic" as const, externalId: "12000", name: "General", date: "2026-11-03", ocdDivisionId: "ocd-division/country:us" },
    { provider: "google-civic" as const, externalId: "12001", name: "Some State Special", date: "2026-11-03", ocdDivisionId: "ocd-division/country:us/state:xx" },
  ];
  it("prefers the national election on the date", () => {
    expect(matchProviderElection(list, "2026-11-03")?.externalId).toBe("12000");
  });
  it("validates an override against the date", () => {
    expect(matchProviderElection(list, "2026-11-03", "12001")?.externalId).toBe("12001");
    expect(matchProviderElection(list, "2026-11-03", "2000")).toBeUndefined();
  });
});
