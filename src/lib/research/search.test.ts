import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ballotpediaCampaignSite, keepUrls, searchUrls } from "./search";

const results = [
  { url: "https://ballotpedia.org/Ann_Bee", title: "Ann Bee - Ballotpedia" },
  { url: "https://ballotpedia.org/California_elections", title: "California elections, 2026" },
  { url: "https://www.assembly.ca.gov/members#bee", title: "Members" },
  { url: "https://smcacre.gov/elections", title: "Elections" },
  { url: "https://www.example.com/ann-bee", title: "Ann Bee news" },
  { url: "https://a.gov/1", title: "1" },
  { url: "https://b.gov/2", title: "2" },
  { url: "https://calmatters.org/politics/2026/10/ann-bee-profile/", title: "Who is Ann Bee?" },
  { url: "https://www.nytimes.com/2026/10/01/us/politics/ann-bee.html", title: "Ann Bee's long road" },
  { url: "https://calmatters.org/politics/2026/10/other/", title: "Another candidate" },
  { url: "https://en.wikipedia.org/wiki/Ann_Bee", title: "Ann Bee - Wikipedia" },
];

describe("keepUrls", () => {
  it("people: .gov, their own Ballotpedia page, vetted news about them, and Wikipedia (as a finder)", () => {
    expect(keepUrls("person", results, ["Bee"])).toEqual([
      "https://ballotpedia.org/Ann_Bee",
      "https://www.assembly.ca.gov/members",
      "https://smcacre.gov/elections",
      "https://a.gov/1",
      "https://calmatters.org/politics/2026/10/ann-bee-profile/",
      "https://www.nytimes.com/2026/10/01/us/politics/ann-bee.html",
      "https://en.wikipedia.org/wiki/Ann_Bee",
    ]);
  });

  it("never keeps outlets outside the vetted news list", () => {
    expect(keepUrls("person", [{ url: "https://www.example.com/ann-bee", title: "Ann Bee news" }], ["Bee"])).toEqual([]);
  });

  it("measures and offices: .gov only, never Ballotpedia, news or Wikipedia", () => {
    const kept = keepUrls("measure", results);
    expect(kept.some((u) => /ballotpedia|wikipedia|calmatters|nytimes/.test(u))).toBe(false);
    expect(kept).toHaveLength(3);
    expect(keepUrls("office", results).every((u) => /\.gov\//.test(u))).toBe(true);
  });
});

describe("ballotpediaCampaignSite", () => {
  it("reads the campaign website Ballotpedia lists", () => {
    expect(ballotpediaCampaignSite('<p><a href="https://annbee.com/" rel="nofollow">Campaign website</a></p>')).toBe("https://annbee.com/");
    expect(ballotpediaCampaignSite('<a href="https://ballotpedia.org/x">Campaign website</a>')).toBeNull();
    expect(ballotpediaCampaignSite("<p>none</p>")).toBeNull();
  });
});

describe("searchUrls", () => {
  it("keeps only allowed result URLs and counts the searches in the cost", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "web_search_tool_result", content: results.map((r) => ({ type: "web_search_result", ...r })) }],
      usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } },
    }));
    const r = await searchUrls({ kind: "office", query: "Governor California duties", client: { messages: { create } } as never });
    expect(r.urls.every((u) => /\.gov\//.test(u))).toBe(true);
    expect(r.costMicroUsd).toBeGreaterThanOrEqual(20_000);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-haiku-5-5", tools: [expect.objectContaining({ type: "web_search_20250305" })] }));
  });

  it("fails closed with no URLs", async () => {
    const create = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await searchUrls({ kind: "person", query: "x", client: { messages: { create } } as never })).toMatchObject({ urls: [], costMicroUsd: 0, problem: "error" });
  });
});
