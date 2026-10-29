import { describe, expect, it, vi } from "vitest";
import { checkEntry } from "./checks";
import { collectNews, nextDue } from "./collect-news";
import type { NewsSource } from "./sources";

const NOW = new Date("2026-10-29T12:00:00Z");

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
function fakeDb(existingUrls: string[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const contests = [
    {
      id: "gov",
      kind: "candidate",
      title: "Governor",
      divisions: { name: "California", state: "CA" },
      contest_candidates: [
        { id: "becerra", ballot_name: "XAVIER BECERRA", display_name: "Xavier Becerra" },
        { id: "hilton", ballot_name: "STEVE HILTON", display_name: "Steve Hilton" },
      ],
    },
  ];
  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: async () => ({ data: table === "contests" ? contests : [], error: null }),
          in: async () => ({ data: table === "feed_items" ? existingUrls.map((url) => ({ url })) : [], error: null }),
        }),
        upsert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          (table === "feed_items" ? inserted : states).push(...(Array.isArray(rows) ? rows : [rows]));
          return { error: null };
        },
      };
    },
  };
  return { db, inserted, states };
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
    const summary = await collectNews({ db: db as never, electionId: "us-2026-11-03-general", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // disabled source never fetched
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
      publish: false,
    });
    expect(inserted).toMatchObject([{ status: "held", held_reason: "publishing paused" }]);
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
    const summary = await collectNews({ db: withState as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(summary).toMatchObject({ sources: 4, due: 3, deferred: 0, fetched: 3 });
    expect(fetchImpl).not.toHaveBeenCalledWith("https://fresh.test/feed", expect.anything());

    fetchImpl.mockClear();
    const out = await collectNews({ db: db as never, electionId: "e", sources, now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch, budgetMs: -1 });
    expect(out).toMatchObject({ due: 4, deferred: 4 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
