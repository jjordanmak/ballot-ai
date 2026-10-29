import { describe, expect, it, vi } from "vitest";
import type { TrackedContest } from "./match";
import { collectPolls, wikiTitlesFor } from "./polls";

const NOW = new Date("2026-10-29T12:00:00Z");
const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

const gov: TrackedContest = {
  id: "gov",
  kind: "candidate",
  title: "Governor",
  divisionName: "California",
  state: "CA",
  stateLevel: true,
  candidates: [
    { id: "becerra", names: ["Xavier Becerra"] },
    { id: "hilton", names: ["Steve Hilton"] },
  ],
};

describe("wikiTitlesFor", () => {
  it("maps state-level contests to Wikipedia's standard page titles", () => {
    expect(wikiTitlesFor(gov)).toEqual(["2026 California gubernatorial election"]);
    expect(wikiTitlesFor({ ...gov, title: "U.S. Senator", state: "GA", divisionName: "Georgia" })).toEqual([
      "2026 United States Senate election in Georgia",
      "2026 United States Senate special election in Georgia",
    ]);
    expect(wikiTitlesFor({ ...gov, title: "U.S. Representative, District 15" })).toEqual([
      "2026 United States House of Representatives elections in California",
    ]);
    expect(wikiTitlesFor({ ...gov, kind: "measure", title: "Proposition 50" })).toEqual(["2026 California Proposition 50"]);
    expect(wikiTitlesFor({ ...gov, title: "City Council", stateLevel: false })).toEqual([]);
  });
});

const WIKITEXT = `== General election ==
{| class="wikitable"
! Poll source !! Date(s) administered !! Sample size !! Margin of error !! Xavier<br />Becerra (D) !! Steve<br />Hilton (R) !! Undecided
|-
| [https://emersoncollegepolling.com/ca-oct-2026 Emerson College] || October 20–22, 2026 || 1,000 (LV) || ± 3.0% || 52% || 39% || 9%
|-
| [https://x.test/internal Hilton campaign poll (R)] || October 18, 2026 || 400 (LV) || ± 4.9% || 44% || 46% || 10%
|}`;

function fakeDb() {
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
  const query = (table: string, op: string, payload?: unknown) => {
    const result = () => {
      if (op === "upsert") {
        upserts.push({ table, rows: (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[] });
        return { data: null, error: null };
      }
      if (table === "contests")
        return {
          data: [
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
          ],
          error: null,
        };
      return { data: [], error: null };
    };
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order", "range", "select"]) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return q;
  };
  return {
    upserts,
    db: { from: (t: string) => ({ select: () => query(t, "select"), upsert: (r: unknown) => query(t, "upsert", r) }) },
  };
}

describe("collectPolls", () => {
  it("publishes approved polls for tracked contests and holds sponsored ones", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { db, upserts } = fakeDb();
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("action") === "query") {
        return Response.json({ query: { pages: [{ title: "2026 California gubernatorial election", revisions: [{ revid: 42 }] }] } });
      }
      return Response.json({ parse: { title: "2026 California gubernatorial election", wikitext: WIKITEXT } });
    });
    const run = collectPolls({ db: db as never, electionId: "e", now: NOW, fetchImpl: fetchImpl as never, resolve: publicDns });
    await vi.runAllTimersAsync();
    const summary = await run;
    vi.useRealTimers();
    expect(summary).toMatchObject({ contests: 1, pages: 1, changed: 1, published: 1, held: 1 });
    const items = upserts.find((u) => u.table === "feed_items")!.rows;
    expect(items[0]).toMatchObject({
      type: "poll",
      publisher: "Emerson College",
      status: "published",
      contest_ids: ["gov"],
      candidate_ids: ["becerra", "hilton"],
      published_at: "2026-10-22T12:00:00.000Z",
    });
    expect((items[0].payload as { results: unknown[] }).results).toEqual([
      { candidateId: "becerra", name: "Xavier Becerra", pct: 52 },
      { candidateId: "hilton", name: "Steve Hilton", pct: 39 },
    ]);
    expect(items[1]).toMatchObject({ status: "held", held_reason: "sponsored or partisan" });
    expect(upserts.find((u) => u.table === "feed_source_state")!.rows[0]).toMatchObject({ source_key: "wiki:2026 California gubernatorial election", etag: "42" });
  });
});
