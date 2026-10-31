import { describe, expect, it, vi } from "vitest";
import { gkgFilesBefore } from "@/lib/feeds/gdeltFiles";
import type { NewsSource } from "@/lib/feeds/sources";
import { gkgLine } from "./__fixtures__/gkg";
import { makeZip } from "./__fixtures__/tiger";
import { GDELT_PROBE_RUN_ID, gkgStats, REPLAY_LABEL, runGdeltProbe } from "./gdeltProbe";

vi.mock("@/lib/feeds/collect-news", () => ({ loadTracked: async () => [] }));
vi.mock("@/lib/feeds/match", () => ({ candidateQueries: () => [{ name: "Jane Sample" }] }));

const TEXT = [
  gkgLine({ domain: "politico.com", url: "https://www.politico.com/a", persons: "jane sample", title: "Jane Sample on the Texas race" }),
  gkgLine({ domain: "politico.com", url: "https://www.politico.com/b", persons: "someone else" }),
  gkgLine({ domain: "elsewhere.test", url: "https://elsewhere.test/c", persons: "jane sample" }),
  "",
].join("\n");

describe("GDELT probe", () => {
  it("counts our outlets, tracked names, and both", () => {
    const s = gkgStats(TEXT, ["politico.com", "tx.test"], ["Jane Sample"]);
    expect(s).toMatchObject({ rows: 3, ourOutlets: 2, byOutlet: { "politico.com": 2 }, namesTracked: 2, ourOutletsNamingTracked: 1, trackedByDomain: { "politico.com": 1, "elsewhere.test": 1 } });
    expect(s.sample).toEqual([{ domain: "politico.com", title: "Jane Sample on the Texas race", names: ["jane sample"] }]);
  });

  it("lists the archived files before the newest, 15 minutes apart, across midnight", () => {
    expect(gkgFilesBefore("http://data.gdeltproject.org/gdeltv2/20261031001500.gkg.csv.zip", 3)).toEqual([
      "http://data.gdeltproject.org/gdeltv2/20261031000000.gkg.csv.zip",
      "http://data.gdeltproject.org/gdeltv2/20261030234500.gkg.csv.zip",
      "http://data.gdeltproject.org/gdeltv2/20261030233000.gkg.csv.zip",
    ]);
    expect(gkgFilesBefore("http://data.gdeltproject.org/gdeltv2/20261031001500.export.CSV.zip", 3)).toEqual([]);
  });

  it("replays the last day once, skipping files that aren't there, and stores one row", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const inserted: Record<string, unknown>[] = [];
    let stored: unknown[] = [];
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: stored }) }) }) }),
        insert: async (r: Record<string, unknown>) => (inserted.push(r), { error: null }),
      }),
    };
    const zip = makeZip({ "x.gkg.csv": new TextEncoder().encode(TEXT) });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("lastupdate.txt")) return new Response(`1 abc http://data.gdeltproject.org/gdeltv2/20261031001500.gkg.csv.zip\n`);
      // One archived file is missing.
      if (u.includes("20261031000000")) return new Response("", { status: 404 });
      return new Response(zip as unknown as BodyInit);
    });
    const sources = [{ key: "politico", name: "Politico", url: "https://rss.politico.com/x.xml", scope: "national", enabled: true, gdeltDomain: "politico.com" }] as NewsSource[];
    const resolve = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;
    const run = () => runGdeltProbe({ db: db as never, electionId: "e", sources, fetchImpl: fetchImpl as unknown as typeof fetch, resolve });

    expect(await run()).toEqual({ stored: true, files: 95 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ run_id: GDELT_PROBE_RUN_ID, label: REPLAY_LABEL, status: "PROBE", contest_count: 95 });
    expect(inserted[0].inventory).toMatchObject({ filesAsked: 96, filesRead: 95, filesMissing: 1, rows: 285, ourOutlets: 190, to: "20261031000000.gkg.csv.zip" });
    // Never the newest listed file, which may not be downloadable yet.
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("20261031001500"))).toBe(false);

    stored = [{ id: "x" }];
    expect(await run()).toEqual({ stored: false });
    expect(inserted).toHaveLength(1);
  });
});
