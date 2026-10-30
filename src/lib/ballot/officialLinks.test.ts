import { describe, expect, it } from "vitest";
import { officialLinks, STATE_LOOKUP_FALLBACK } from "./copy";

describe("officialLinks", () => {
  it("lists the election office's own pages, sample ballot first, without repeats (non-CA)", () => {
    expect(
      officialLinks({
        name: "Travis County Elections",
        regionName: "Texas",
        ballotInfoUrl: "https://example.gov/ballot",
        electionInfoUrl: "https://example.gov/ballot",
        voterLookupUrl: "https://example.gov/am-i-registered",
      }),
    ).toEqual([
      { label: "Travis County Elections: ballot information", url: "https://example.gov/ballot" },
      { label: "Texas voter lookup", url: "https://example.gov/am-i-registered" },
    ]);
  });

  it("falls back to the national election-office finder when the provider names none", () => {
    expect(officialLinks(undefined)).toEqual([STATE_LOOKUP_FALLBACK]);
    expect(officialLinks({ name: "Some Office" })).toEqual([STATE_LOOKUP_FALLBACK]);
  });
});
