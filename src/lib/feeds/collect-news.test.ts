import { describe, expect, it, vi } from "vitest";
import { checkEntry } from "./checks";
import { collectNews, nextDue, retryAfter } from "./collect-news";
import type { NewsSource } from "./sources";

const NOW = new Date("2026-10-29T12:00:00Z");
const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

describe("checkEntry", () => {
  const base = { title: "Becerra rally", link: "https://example.com/news/a", categories: [], published: new Date("2026-10-29T10:00:00Z") };
  it("publishes recent news and skips old items", () => {
    expect(checkEntry(base, NOW)).toEqual({ status: "published" });
    expect(checkEntry({ ...base, published: new Date("2026-10-01T00:00:00Z") }, NOW)).toEqual({ status: "skip" });
  });
  it("holds opinion, sponsored, undated and future-dated items", () => {
    expect(checkEntry({ ...base, title: "Opinion: vote no" }, NOW)).toMatchObject({ status: "held" });
    expect(checkEntry({ ...base, link: "https://example.com/opinion/x" }, NOW)).toMatchObject({ status: "held" });
    expect(checkEntry({ ...base, categories: ["Sponsored"] }, NOW)).toMatchObject({ status: "held" });
    expect(checkEntry({ ...base, published: undefined }, NOW)).toMatchObject({ status: "held", reason: "no publish date" });
    expect(checkEntry({ ...base, published: new Date("2026-10-30T12:00:00Z") }, NOW)).toMatchObject({ status: "held" });
  });
});

/** Minimal stand-in for the Supabase query builder: just the calls collectNews makes. */
function fakeDb(existingUrls: string[] = [], readUrls: string[] = [], existingRows: Record<string, unknown>[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const reads: Record<string, unknown>[] = [];
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
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  /** Chainable, awaitable stand-in for a PostgREST query: resolves by table and operation. */
  const query = (table: string, op: "select" | "update" | "upsert", payload?: unknown) => {
    const result = () => {
      if (op === "upsert") {
        const into = table === "feed_items" ? inserted : table === "feed_article_reads" ? reads : table === "feed_source_state" ? states : [];
        into.push(...(Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[]);
        return { data: null, error: null };
      }
      if (op === "update") {
        updates.push({ table, values: payload as Record<string, unknown> });
        return { data: [], error: null };
      }
      if (table === "contests") return { data: contests, error: null };
      if (table === "feed_items") return { data: [...existingUrls.map((url) => ({ url })), ...existingRows], error: null };
      if (table === "feed_article_reads") return { data: readUrls.map((url) => ({ url })), error: null };
      if (table === "fetch_hosts") return { data: null, error: null };
      return { data: [], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order", "range", "lte", "gte", "is", "select", "limit", "maybeSingle"]) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return q;
  };
  const db = {
    // The site's next request slot is free right away.
    rpc: async () => ({ data: 0, error: null }),
    from(table: string) {
      return {
        select: () => query(table, "select"),
        update: (v: unknown) => query(table, "update", v),
        upsert: (rows: unknown) => query(table, "upsert", rows),
      };
    },
  };
  return { db, inserted, states, reads, updates };
}

const rss = (items: string) => `<rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
const item = (title: string, link: string, date = "Thu, 29 Oct 2026 09:00:00 GMT", desc = "") =>
  `<item><title>${title}</title><link>${link}</link><description>${desc}</description><pubDate>${date}</pubDate></item>`;

describe("collectNews", () => {
  it("stores matched articles once, publishes or holds them, and skips everything else", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted, states } = fakeDb(["https://news.test/seen"]);
    const sources: NewsSource[] = [
      { key: "a", name: "Outlet A", url: "https://a.test/feed", scope: "national", enabled: true },
      { key: "b", name: "Outlet B", url: "https://b.test/feed", scope: "state", state: "CA", enabled: true },
      { key: "off", name: "Off", url: "https://off.test/feed", scope: "national", enabled: false },
    ];
    const feeds: Record<string, string> = {
      "https://a.test/feed": rss(
        item("Xavier Becerra and Steve Hilton debate", "https://news.test/debate?utm_source=rss", undefined, "The governor race heats up") +
          item("Opinion: Steve Hilton for governor", "https://news.test/op", undefined, "Steve Hilton governor") +
          item("Weather today", "https://news.test/weather") +
          item("Becerra already stored", "https://news.test/seen", undefined, "Xavier Becerra governor"),
      ),
      "https://b.test/feed": rss(item("Xavier Becerra unveils plan", "https://news.test/debate", undefined, "Xavier Becerra said")),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(feeds[String(url)] ?? "", { status: feeds[String(url)] ? 200 : 404 }));
    const summary = await collectNews({ db: db as never, electionId: "us-2026-11-03-general", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns });

    const feedCalls = fetchImpl.mock.calls.map(([u]) => String(u)).filter((u) => u.endsWith("/feed"));
    expect(feedCalls.sort()).toEqual(["https://a.test/feed", "https://b.test/feed"]); // disabled source never fetched
    expect(inserted.map((r) => [r.url, r.status, r.held_reason])).toEqual([
      ["https://news.test/debate", "published", null],
      ["https://news.test/op", "held", "opinion or sponsored"],
    ]);
    expect(inserted[0]).toMatchObject({ contest_ids: ["gov"], candidate_ids: expect.arrayContaining(["becerra", "hilton"]), publisher: "Outlet A" });
    expect(summary).toMatchObject({ fetched: 2, published: 1, held: 1 });
    expect(states).toHaveLength(2);
  });

  it("holds everything when publishing is paused", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted } = fakeDb();
    const fetchImpl = vi.fn(async () => new Response(rss(item("Xavier Becerra rally", "https://news.test/r", undefined, "governor race"))));
    await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "a", name: "A", url: "https://a.test/feed", scope: "national", enabled: true }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
      publish: false,
    });
    expect(inserted).toMatchObject([{ status: "held", held_reason: "publishing paused" }]);
  });
});

describe("collectNews article text", () => {
  const page = (body: string) => `<html><body><nav>Sections</nav><article><h1>Story</h1><p>${body}</p><p>${"More reporting. ".repeat(40)}</p></article></body></html>`;
  const sources: NewsSource[] = [{ key: "a", name: "Outlet A", url: "https://a.test/feed", scope: "national", enabled: true }];

  it("reads the page when the headline doesn't name anyone, matches on the story, and remembers every read", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted, reads } = fakeDb();
    const feed = rss(
      item("Insurance rates jump again", "https://news.test/insurance", undefined, "Homeowners face higher premiums.") +
        item("Weather today", "https://news.test/weather") +
        item("Library hours change", "https://news.test/library"),
    );
    const pages: Record<string, string> = {
      "https://news.test/insurance": page("Xavier Becerra, a candidate for governor, said he would freeze rates. Becerra spoke in Fresno."),
      "https://news.test/weather": page("Sunny skies with a chance of fog along the coast."),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === "https://a.test/feed") return new Response(feed, { headers: { "content-type": "application/rss+xml" } });
      if (pages[u]) return new Response(pages[u], { headers: { "content-type": "text/html" } });
      return new Response("", { status: 404 });
    });
    const summary = await collectNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns });
    expect(inserted).toMatchObject([{ url: "https://news.test/insurance", contest_ids: ["gov"], candidate_ids: ["becerra"], match: { via: "article" } }]);
    expect(summary).toMatchObject({ matched: 1, matchedOnText: 1, articlesRead: 2, readsFailed: 1 });
    expect(reads.map((r) => [r.url, r.outcome, r.matched])).toEqual(
      expect.arrayContaining([
        ["https://news.test/insurance", "read", true],
        ["https://news.test/weather", "read", false],
        ["https://news.test/library", "error", false],
      ]),
    );
    // The headline and summary are kept; the story's text is not.
    expect(JSON.stringify(inserted)).not.toContain("freeze rates");
  });

  it("uses the feed's own full text without reading the page, and never reads an article twice", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted, reads } = fakeDb([], ["https://news.test/old"]);
    const full = `Xavier Becerra, running for governor, toured a clinic. ${"Details of the visit. ".repeat(100)} Becerra left at noon.`;
    const feed = rss(
      `<item><title>A day on the trail</title><link>https://news.test/trail</link><description>Short teaser.</description><content:encoded><![CDATA[<p>${full}</p>]]></content:encoded><pubDate>Thu, 29 Oct 2026 09:00:00 GMT</pubDate></item>` +
        item("Read before", "https://news.test/old"),
    );
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url) === "https://a.test/feed" ? new Response(feed) : new Response(page("Xavier Becerra for governor. Becerra said."), { headers: { "content-type": "text/html" } }),
    );
    await collectNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns });
    expect(inserted).toMatchObject([{ url: "https://news.test/trail", match: { via: "article" } }]);
    expect(fetchImpl.mock.calls.map(([u]) => String(u))).toEqual(["https://a.test/feed"]);
    expect(reads).toEqual([]);
  });

  it("skips a site that refused 3 reads in the last day", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, reads } = fakeDb([], ["https://news.test/a", "https://news.test/b", "https://news.test/c"]);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url) === "https://a.test/feed" ? new Response(rss(item("Insurance rates jump", "https://news.test/new"))) : new Response(page("x"), { headers: { "content-type": "text/html" } }),
    );
    await collectNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns });
    expect(fetchImpl.mock.calls.map(([u]) => String(u))).toEqual(["https://a.test/feed"]);
    expect(reads).toEqual([]);
  });

  it("doesn't read pages for a state outlet whose state has no tracked races", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = fakeDb();
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/feed") ? new Response(rss(item("City budget vote", "https://tx.test/budget"))) : new Response(page("x"), { headers: { "content-type": "text/html" } }),
    );
    const summary = await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "tx", name: "TX", url: "https://tx.test/feed", scope: "state", state: "TX", enabled: true }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
    });
    expect(summary.articlesRead + summary.readsFailed).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("collectNews and stories found by name first", () => {
  it("gives a story GDELT found first the outlet's own headline and summary, keeping its races", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prior = { url: "https://news.test/debate", match: { via: "gdelt" }, contest_ids: ["other"], candidate_ids: ["someone"] };
    const { db, inserted, updates } = fakeDb([], [], [prior]);
    const fetchImpl = vi.fn(async () => new Response(rss(item("Xavier Becerra and Steve Hilton debate", "https://news.test/debate", undefined, "The governor race heats up"))));
    await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "a", name: "A", url: "https://a.test/feed", scope: "national", enabled: true }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
    });
    expect(inserted).toEqual([]);
    expect(updates.find((u) => u.table === "feed_items" && "title" in u.values)?.values).toMatchObject({
      title: "Xavier Becerra and Steve Hilton debate",
      excerpt: "The governor race heats up",
      contest_ids: expect.arrayContaining(["other", "gov"]),
      candidate_ids: expect.arrayContaining(["someone", "becerra", "hilton"]),
    });
  });
});

describe("nextDue", () => {
  const at = (iso: string) => Date.parse(iso);
  it("fetches never-seen sources first and spaces tiers apart", () => {
    expect(nextDue({ scope: "state" }, null)).toBe(0);
    const last = "2026-10-29T12:00:00Z";
    expect(nextDue({ scope: "national" }, { last_fetched_at: last, failures: 0 })).toBe(at("2026-10-29T12:01:40Z"));
    expect(nextDue({ scope: "state" }, { last_fetched_at: last, failures: 0 })).toBe(at("2026-10-29T12:05:40Z"));
    expect(nextDue({ scope: "local" }, { last_fetched_at: last, failures: 0 })).toBe(at("2026-10-29T12:09:40Z"));
  });
  it("backs off failing sources, capped at six hours", () => {
    const last = "2026-10-29T12:00:00Z";
    expect(nextDue({ scope: "national" }, { last_fetched_at: last, failures: 3 })).toBe(at("2026-10-29T12:15:40Z"));
    expect(nextDue({ scope: "state" }, { last_fetched_at: last, failures: 40 })).toBe(at("2026-10-29T17:59:40Z"));
  });
  it("waits as long as a publisher's Retry-After asks", () => {
    const last = "2026-10-29T12:00:00Z";
    expect(nextDue({ scope: "national" }, { last_fetched_at: last, failures: 1, retry_at: "2026-10-29T13:00:00Z" })).toBe(at("2026-10-29T13:00:00Z"));
    expect(retryAfter("120", new Date(last))).toBe("2026-10-29T12:02:00.000Z");
    expect(retryAfter("Thu, 29 Oct 2026 12:30:00 GMT", new Date(last))).toBe("2026-10-29T12:30:00.000Z");
    expect(retryAfter("soon", new Date(last))).toBeNull();
  });
});

describe("collectNews scheduling", () => {
  it("skips sources that aren't due and stops starting fetches when the time budget runs out", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = fakeDb();
    const recent = { source_key: "fresh", last_fetched_at: "2026-10-29T11:59:30Z", failures: 0 };
    const withState = {
      from(table: string) {
        const base = db.from(table);
        if (table !== "feed_source_state") return base;
        return { ...base, select: () => ({ ...base.select(), in: async () => ({ data: [recent], error: null }) }) };
      },
    };
    const sources: NewsSource[] = ["fresh", "a", "b", "c"].map((key) => ({ key, name: key, url: `https://${key}.test/feed`, scope: "national", enabled: true }));
    const fetchImpl = vi.fn(async () => new Response(rss("")));
    const summary = await collectNews({ db: withState as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns });
    expect(summary).toMatchObject({ sources: 4, due: 3, deferred: 0, fetched: 3 });
    expect(fetchImpl).not.toHaveBeenCalledWith("https://fresh.test/feed", expect.anything());

    fetchImpl.mockClear();
    const out = await collectNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, resolve: publicDns, budgetMs: -1 });
    expect(out).toMatchObject({ due: 4, deferred: 4 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("collectNews robustness", () => {
  it("treats a 200 that isn't a feed as a failure (when the site advertises no feed), and saves source state only after storing items", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, states } = fakeDb();
    const fetchImpl = vi.fn(async () => new Response("<!doctype html><html><body>Moved</body></html>"));
    const summary = await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "a", name: "A", url: "https://a.test/feed", scope: "national", enabled: true }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
    });
    expect(summary.failed).toEqual(["a: no feed advertised"]);
    expect(states).toMatchObject([{ source_key: "a", failures: 1, last_error: "no feed advertised", resolved_url: null }]);
  });

  it("finds a moved feed on the outlet's own site and keeps using it", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, states } = fakeDb();
    const RSS = `<?xml version="1.0"?><rss><channel><title>A</title></channel></rss>`;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://a.test/old-feed") return new Response("gone", { status: 404 });
      if (url === "https://a.test/") return new Response(`<html><head><link rel="alternate" type="application/rss+xml" href="/politics/feed/"><link rel="alternate" type="application/rss+xml" href="https://other.test/feed"></head></html>`);
      if (url === "https://a.test/politics/feed/") return new Response(RSS);
      return new Response("?", { status: 500 });
    });
    const summary = await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "a", name: "A", url: "https://a.test/old-feed", scope: "national", enabled: true }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
    });
    expect(summary.failed).toEqual([]);
    expect(summary.discovered).toEqual(["a: https://a.test/politics/feed/"]);
    expect(states).toMatchObject([{ source_key: "a", failures: 0, resolved_url: "https://a.test/politics/feed/" }]);
  });

  it("never fetches a turned-off source", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = fakeDb();
    const fetchImpl = vi.fn(async () => new Response(""));
    await collectNews({
      db: db as never,
      electionId: "e",
      sources: [{ key: "a", name: "A", url: "https://a.test/feed", scope: "national", enabled: false, disabledReason: "blocks automated readers" }],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicDns,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("re-publishes held items once publishing is back on", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, updates } = fakeDb();
    await collectNews({ db: db as never, electionId: "e", sources: [], now: NOW, resolve: publicDns });
    expect(updates.filter((u) => u.table === "feed_items" && u.values.status === "published")).toHaveLength(2);
    updates.length = 0;
    await collectNews({ db: db as never, electionId: "e", sources: [], now: NOW, resolve: publicDns, publish: false });
    expect(updates).toHaveLength(0);
  });
});
