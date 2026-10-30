import { describe, expect, it, vi } from "vitest";
import { collectApiNews } from "./collect-apis";
import type { NewsSource } from "./sources";

const NOW = new Date("2026-10-29T12:00:00Z");
const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

function fakeDb(existingUrls: string[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const contests = [
    {
      id: "gov",
      kind: "candidate",
      title: "Governor",
      division_key: "ocd-division/country:us/state:ca",
      divisions: { name: "California", state: "CA", scope: "statewide" },
      contest_candidates: [
        { id: "becerra", ballot_name: "XAVIER BECERRA", display_name: "Xavier Becerra" },
        { id: "hilton", ballot_name: "STEVE HILTON", display_name: "Steve Hilton" },
      ],
    },
  ];
  const query = (table: string, op: "select" | "upsert", payload?: unknown) => {
    const result = () => {
      if (op === "upsert") {
        (table === "feed_items" ? inserted : states).push(...(payload as Record<string, unknown>[]));
        return { data: null, error: null };
      }
      if (table === "contests") return { data: contests, error: null };
      if (table === "feed_items") return { data: existingUrls.map((url) => ({ url })), error: null };
      return { data: [], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order", "range", "select", "limit"]) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return q;
  };
  return {
    db: { from: (t: string) => ({ select: () => query(t, "select"), upsert: (rows: unknown) => query(t, "upsert", rows) }) },
    inserted,
    states,
  };
}

const sources: NewsSource[] = [
  { key: "politico", name: "Politico", url: "https://rss.politico.com/politics-news.xml", scope: "national", enabled: true, gdeltDomain: "politico.com" },
  { key: "ocregister-politics", name: "Orange County Register", url: "https://www.ocregister.com/feed", scope: "state", state: "CA", enabled: false, gdeltDomain: "ocregister.com" },
  { key: "tx-paper", name: "Texas Paper", url: "https://tx.test/feed", scope: "state", state: "TX", enabled: true, gdeltDomain: "tx.test" },
];

const gdelt = JSON.stringify({
  articles: [
    { url: "https://www.politico.com/news/2026/10/29/becerra-insurance?utm_source=x", title: "Becerra pitches insurance freeze", seendate: "20261029T100000Z", domain: "politico.com", language: "English" },
    { url: "https://www.ocregister.com/2026/10/29/opinion/becerra", title: "Opinion: Becerra is wrong", seendate: "20261029T100000Z", domain: "ocregister.com", language: "English" },
    { url: "https://unvetted.example/becerra", title: "Becerra rumor", seendate: "20261029T100000Z", domain: "unvetted.example", language: "English" },
  ],
});
const nyt = JSON.stringify({
  response: {
    docs: [
      { web_url: "https://www.nytimes.com/2026/10/29/us/politics/hilton.html", headline: { main: "Hilton's Final Push" }, abstract: "A look at the closing days.", pub_date: "2026-10-29T09:00:00+0000", type_of_material: "News", keywords: [{ name: "persons", value: "Hilton, Steve" }] },
      { web_url: "https://www.nytimes.com/2026/10/29/travel/hilton-hotels.html", headline: { main: "A Weekend at the Hilton" }, pub_date: "2026-10-29T09:00:00+0000", type_of_material: "News" },
    ],
  },
});

describe("collectApiNews", () => {
  it("stores what GDELT and the NYT find under the outlet, only from vetted outlets, and never re-stores an article", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted, states } = fakeDb(["https://www.politico.com/news/2026/10/29/stored-already"]);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://api.gdeltproject.org/")) return new Response(gdelt);
      if (u.startsWith("https://api.nytimes.com/")) return new URL(u).searchParams.get("q") === '"Steve Hilton"' ? new Response(nyt) : new Response(JSON.stringify({ response: { docs: [] } }));
      return new Response("", { status: 404 });
    });
    const summary = await collectApiNews({ db: db as never, electionId: "e", sources, nytKey: "test-key", now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns, sleep: async () => {} });

    // GDELT is asked only about outlets covering this race: Politico and the CA paper, never the Texas one.
    const gdeltCalls = fetchImpl.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("gdeltproject"));
    expect(gdeltCalls.every((u) => !decodeURIComponent(u).includes("tx.test"))).toBe(true);
    expect(inserted.map((r) => [r.url, r.source_key, r.publisher, r.status, (r.match as { via: string }).via])).toEqual([
      ["https://www.politico.com/news/2026/10/29/becerra-insurance", "politico", "Politico", "published", "gdelt"],
      ["https://www.ocregister.com/2026/10/29/opinion/becerra", "ocregister-politics", "Orange County Register", "held", "gdelt"],
      ["https://www.nytimes.com/2026/10/29/us/politics/hilton.html", "nyt-politics", "The New York Times", "published", "nyt-api"],
    ]);
    // The hotel story names no tracked person in a way that identifies them.
    expect(inserted.some((r) => String(r.url).includes("hilton-hotels"))).toBe(false);
    expect(summary).toMatchObject({ gdeltThrottled: false, stored: 3, published: 2 });
    expect(states.map((s) => s.source_key)).toEqual(expect.arrayContaining(["gdelt:becerra", "nyt:hilton"]));
    // The key is never stored or logged.
    expect(JSON.stringify([inserted, states, summary])).not.toContain("test-key");
  });

  it("stops asking GDELT when it says to slow down, and skips the NYT without a key", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted } = fakeDb();
    const fetchImpl = vi.fn(async () => new Response("Please limit requests to one every 5 seconds or contact us."));
    const summary = await collectApiNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns, sleep: async () => {} });
    expect(summary).toMatchObject({ gdeltAsked: 1, gdeltThrottled: true, nytAsked: 0, nytSkipped: "no NYT_API_KEY" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
  });
});
