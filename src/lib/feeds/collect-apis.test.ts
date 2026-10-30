import { describe, expect, it, vi } from "vitest";
import { collectApiNews } from "./collect-apis";
import type { NewsSource } from "./sources";

const NOW = new Date("2026-10-29T12:00:00Z");
const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

function fakeDb(existingUrls: string[] = [], priorStates: Record<string, unknown>[] = []) {
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
    {
      id: "school",
      kind: "candidate",
      title: "Governing Board Member, Placentia-Yorba Linda Unified School District",
      division_key: "ocd-division/country:us/state:ca/school_district:placentia-yorba_linda_unified",
      divisions: { name: "Placentia-Yorba Linda Unified School District", state: "CA", scope: "schoolBoard" },
      contest_candidates: [
        { id: "smith", ballot_name: "JOHN SMITH", display_name: "John Smith" },
        { id: "garcia", ballot_name: "MARIA GARCIA", display_name: "Maria Garcia" },
      ],
    },
    {
      id: "appeal",
      kind: "candidate",
      title: "Associate Justice, Court of Appeal, Fourth Appellate District, Division Three",
      division_key: "ca:court:appeal-4-3",
      divisions: { name: "Fourth Appellate District, Division Three", state: "CA", scope: null },
      contest_candidates: [{ id: "motoike", ballot_name: "JOANNE MOTOIKE", display_name: "Joanne Motoike" }],
    },
  ];
  const query = (table: string, op: "select" | "upsert", payload?: unknown) => {
    let single = false;
    const result = () => {
      if (op === "upsert") {
        (table === "feed_items" ? inserted : states).push(...(payload as Record<string, unknown>[]));
        return { data: null, error: null };
      }
      if (table === "contests") return { data: contests, error: null };
      if (table === "elections") return { data: { date: "2026-11-03", cycle_start: "2024-11-06" }, error: null };
      if (table === "feed_items") return { data: existingUrls.map((url) => ({ url })), error: null };
      if (table === "feed_source_state") return { data: single ? (priorStates.find((r) => r.source_key === "gdelt:_backoff") ?? null) : priorStates, error: null };
      return { data: [], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order", "range", "select", "limit"]) q[m] = () => q;
    q.maybeSingle = () => ((single = true), q);
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

    // One GDELT search per race, statewide first, then the appellate court; the school board waits.
    // Only outlets covering the race are asked: Politico and the CA paper, never the Texas one.
    const calls = fetchImpl.mock.calls.map(([u]) => decodeURIComponent(String(u).replace(/\+/g, " ")));
    const gdeltCalls = calls.filter((u) => u.includes("gdeltproject"));
    expect(gdeltCalls).toHaveLength(2);
    expect(gdeltCalls[0]).toContain('("Xavier Becerra" OR "Steve Hilton")');
    expect(gdeltCalls[1]).toContain('"Joanne Motoike"');
    expect(gdeltCalls.every((u) => !u.includes("tx.test"))).toBe(true);
    // The NYT is a national paper: never asked about school-board candidates or judges.
    const nytAsked = calls.filter((u) => u.includes("nytimes")).map((u) => new URL(u).searchParams.get("q"));
    expect(nytAsked.sort()).toEqual(['"Steve Hilton"', '"Xavier Becerra"']);
    // The two APIs run in parallel, so storage order isn't fixed.
    const byUrl = [...inserted].sort((a, b) => String(a.url).localeCompare(String(b.url)));
    expect(byUrl.map((r) => [r.url, r.source_key, r.publisher, r.status, (r.match as { via: string }).via])).toEqual([
      ["https://www.nytimes.com/2026/10/29/us/politics/hilton.html", "nyt-politics", "The New York Times", "published", "nyt-api"],
      ["https://www.ocregister.com/2026/10/29/opinion/becerra", "ocregister-politics", "Orange County Register", "held", "gdelt"],
      ["https://www.politico.com/news/2026/10/29/becerra-insurance", "politico", "Politico", "published", "gdelt"],
    ]);
    // The hotel story names no tracked person in a way that identifies them.
    expect(inserted.some((r) => String(r.url).includes("hilton-hotels"))).toBe(false);
    expect(summary).toMatchObject({ gdeltThrottled: false, stored: 3, published: 2 });
    // A story attaches to a candidate only when its headline names them.
    expect(byUrl.filter((r) => (r.match as { via: string }).via === "gdelt").map((r) => [r.contest_ids, r.candidate_ids])).toEqual([
      [["gov", "appeal"], ["becerra"]],
      [["gov", "appeal"], ["becerra"]],
    ]);
    expect(states.map((s) => s.source_key)).toEqual(expect.arrayContaining(["gdelt:race:gov", "gdelt:race:appeal", "nyt:hilton", "nyt:becerra"]));
    expect(states.find((s) => s.source_key === "gdelt:_backoff")).toMatchObject({ failures: 0, retry_at: null });
    // The key is never stored or logged.
    expect(JSON.stringify([inserted, states, summary])).not.toContain("test-key");
  });

  it.each([
    ["a 429", () => new Response("Too Many Requests", { status: 429 })],
    ["its slow-down note", () => new Response("Please limit requests to one every 5 seconds or contact us.")],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
  ])("stops asking GDELT on %s and backs off, doubling each time; skips the NYT without a key", async (_, answer) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted, states } = fakeDb([], [{ source_key: "gdelt:_backoff", failures: 1, retry_at: "2026-10-29T11:50:00Z" }]);
    const fetchImpl = vi.fn(async () => answer());
    const summary = await collectApiNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns, sleep: async () => {} });
    expect(summary).toMatchObject({ gdeltAsked: 1, gdeltThrottled: true, nytAsked: 0, nytSkipped: "no NYT_API_KEY" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
    // Second refusal in a row: 20 minutes.
    expect(states.find((s) => s.source_key === "gdelt:_backoff")).toMatchObject({ failures: 2, retry_at: "2026-10-29T12:20:00.000Z" });
  });

  it("doesn't ask GDELT at all while backing off", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = fakeDb([], [{ source_key: "gdelt:_backoff", failures: 3, retry_at: "2026-10-29T12:30:00Z" }]);
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const summary = await collectApiNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns, sleep: async () => {} });
    expect(summary).toMatchObject({ gdeltAsked: 0, gdeltSkipped: "backing off" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
