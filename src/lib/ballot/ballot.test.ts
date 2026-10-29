import { describe, expect, it } from "vitest";
import { categorizeContest } from "@/domain/categorize";
import { AddressInput } from "@/lib/providers/address";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { redact } from "@/lib/observability/log";
import { computeBallotKey, BALLOT_KEY_PATTERN } from "./ballotKey";
import { validateBallot } from "./validate";
import { inspect } from "node:util";

const election = {
  id: "us-2026-11-03-general",
  slug: "2026-11-03",
  name: "General Election",
  date: "2026-11-03",
  externalIds: { fixture: "9999" },
};

describe("ballot key", () => {
  it("is order-independent, stable, and URL-safe", () => {
    const a = computeBallotKey("e", ["b", "a", "a"]);
    expect(a).toBe(computeBallotKey("e", ["a", "b"]));
    expect(a).not.toBe(computeBallotKey("e2", ["a", "b"]));
    expect(a).toMatch(BALLOT_KEY_PATTERN);
  });
});

describe("AddressInput", () => {
  it("rejects bare ZIPs and junk", () => {
    expect(AddressInput.parse("94015")).toBeNull();
    expect(AddressInput.parse("")).toBeNull();
    expect(AddressInput.parse(42)).toBeNull();
  });
  it("redacts itself everywhere except reveal()", () => {
    const a = AddressInput.parse("  1 Sample   Way, Sample City ")!;
    expect(a.reveal()).toBe("1 Sample Way, Sample City");
    expect(String(a)).toBe("[redacted address]");
    expect(JSON.stringify({ a })).toBe('{"a":"[redacted address]"}');
    expect(inspect(a)).toBe("[redacted address]");
  });
});

describe("redact", () => {
  it("scrubs street addresses and keys", () => {
    expect(redact("failed for 4 Belmont Dr, Daly City")).not.toMatch(/Belmont/);
    expect(redact("GET /voterinfo?address=x&key=abc")).toBe("GET /voterinfo?address=[redacted]&key=[redacted]");
    expect(redact("key AIzaSyA1234567890abcdefghijklmn")).toContain("[redacted-key]");
    expect(redact("status 400 parseError")).toBe("status 400 parseError");
  });
});

describe("categorizeContest", () => {
  it("treats US Senate (statewide district, country level) as federal", () => {
    expect(categorizeContest({ kind: "candidate", scope: "statewide", levels: ["country"], roles: ["legislatorUpperBody"] })).toBe("federal");
  });
  it("falls back to 'other'", () => {
    expect(categorizeContest({ kind: "candidate" })).toBe("other");
  });
});

describe("FixtureBallotResolver + validators", () => {
  it("simulates failure states by keyword", async () => {
    const r = new FixtureBallotResolver();
    expect((await r.resolveBallot(AddressInput.parse("1 ratelimit St")!, election)).status).toBe("RATE_LIMITED");
    expect((await r.resolveBallot(AddressInput.parse("1 nocoverage St")!, election)).status).toBe("NO_COVERAGE");
  });
  it("validates the sample ballot", async () => {
    const b = await new FixtureBallotResolver().resolveBallot(AddressInput.parse("1 Sample Way")!, election);
    const w = validateBallot(b, "2026-10-28");
    expect(w.map((x) => x.code)).toContain("CONTEST_WITHOUT_CHOICES");
    expect(w.map((x) => x.code)).not.toContain("DUPLICATE_CANDIDATE");
    expect(validateBallot(b, "2026-11-04").map((x) => x.code)).toContain("STALE_ELECTION");
  });
});
