import { afterEach, describe, expect, it, vi } from "vitest";
import { billingPeriod, consumeQuota, monthlyLimit } from "./quota";

afterEach(() => vi.unstubAllEnvs());

describe("monthly API quota", () => {
  it("defaults to Google's free 10,000 per month and takes whole-number overrides", () => {
    expect(monthlyLimit("places.autocomplete")).toBe(10000);
    vi.stubEnv("PLACES_AUTOCOMPLETE_MONTHLY_LIMIT", "50000");
    expect(monthlyLimit("places.autocomplete")).toBe(50000);
    vi.stubEnv("PLACES_DETAILS_MONTHLY_LIMIT", "0");
    expect(monthlyLimit("places.details")).toBe(0);
    vi.stubEnv("PLACES_DETAILS_MONTHLY_LIMIT", "lots");
    expect(monthlyLimit("places.details")).toBe(10000);
  });

  it("counts by calendar month in Pacific time", () => {
    expect(billingPeriod(new Date("2026-11-01T06:59:00Z"))).toBe("2026-10");
    expect(billingPeriod(new Date("2026-11-01T07:01:00Z"))).toBe("2026-11");
  });

  it("fails closed: no call when the limit is 0 or the counter is unreachable", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("PLACES_AUTOCOMPLETE_MONTHLY_LIMIT", "0");
    expect(await consumeQuota("places.autocomplete")).toBe(false);
    vi.stubEnv("PLACES_AUTOCOMPLETE_MONTHLY_LIMIT", "100");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await consumeQuota("places.autocomplete")).toBe(false);
  });
});
