import { describe, expect, it, vi } from "vitest";
import type { NewsSource } from "@/lib/feeds/sources";
import { gkgLine } from "./__fixtures__/gkg";
import { makeZip } from "./__fixtures__/tiger";
import { GDELT_PROBE_RUN_ID, gkgStats, runGdeltProbe } from "./gdeltProbe";

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
    expect(s).toMatchObject({ rows: 3, ourOutlets: 2, byOutlet: { "politico.com": 2 }, namesTracked: 2, ourOutletsNamingTracked: 1 });
    expect(s.sample).toEqual([{ domain: "politico.com", title: "Jane Sample on the Texas race", names: ["jane sample"] }]);
  });

  it("downloads the newest file, stores its counts, and stops after 4 runs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const inserted: Record<string, unknown>[] = [];
    let stored = 0;
    const db = { from: () => ({ select: () => ({ eq: async () => ({ count: stored }) }), insert: async (r: Record<string, unknown>) => (inserted.push(r), { error: null }) }) };
    const zip = makeZip({ "20261030224500.gkg.csv": new TextEncoder().encode(TEXT) });
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("lastupdate.txt") ? new Response(`${zip.byteLength} abc http://data.gdeltproject.org/gdeltv2/20261030224500.gkg.csv.zip\n`) : new Response(zip as unknown as BodyInit),
    );
    const sources = [{ key: "politico", name: "Politico", url: "https://rss.politico.com/x.xml", scope: "national", enabled: true, gdeltDomain: "politico.com" }] as NewsSource[];
    const resolve = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

    expect(await runGdeltProbe({ db: db as never, electionId: "e", sources, fetchImpl: fetchImpl as unknown as typeof fetch, resolve })).toEqual({ stored: true, done: 1 });
    expect(inserted[0]).toMatchObject({ run_id: GDELT_PROBE_RUN_ID, label: "GDELT · 20261030224500.gkg.csv.zip", status: "PROBE", contest_count: 1 });
    expect(inserted[0].inventory).toMatchObject({ rows: 3, ourOutlets: 2, trackedNames: 1, outlets: 1 });

    stored = 4;
    expect(await runGdeltProbe({ db: db as never, electionId: "e", sources, fetchImpl: fetchImpl as unknown as typeof fetch, resolve })).toEqual({ stored: false, done: 4 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
