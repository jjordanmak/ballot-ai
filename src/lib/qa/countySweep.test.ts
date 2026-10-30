import { describe, expect, it, vi } from "vitest";
import type { ElectionRef } from "@/domain/ballot";
import type { BallotRuntime } from "@/lib/ballot/runtime";
import { FixtureBallotResolver } from "@/lib/providers/fixture";
import { makeDbf, makeZip } from "./__fixtures__/tiger";
import { runCountySweep, SWEEP_RUN_ID } from "./countySweep";
import { ADDRFEAT_FIELDS } from "./tiger";

const election: ElectionRef = { id: "us-2026-11-03-general", slug: "2026-11-03", name: "General Election", date: "2026-11-03", externalIds: {} };
const LIST = "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT\nCA|06|999|0|Sample County|H1|A\nTX|48|999|0|Example County|H1|A\nOH|39|999|0|Done County|H1|A\nWY|56|999|0|Empty County|H1|A\n";
const county = (rows: Record<string, string>[]) => makeZip({ "x.dbf": makeDbf(ADDRFEAT_FIELDS, rows) });

function fakeDb(doneLabels: string[]) {
  const inserted: Record<string, unknown>[] = [];
  const q = { eq: () => q, range: async () => ({ data: doneLabels.map((label) => ({ label })), error: null }) };
  return {
    db: { from: () => ({ select: () => q, insert: async (rows: Record<string, unknown>[]) => (inserted.push(...rows), { error: null }) }) },
    inserted,
  };
}

describe("runCountySweep", () => {
  it("looks up each county not yet done, stores only its label and results, and never an address", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, inserted } = fakeDb(["OH · Done County (39999)"]);
    const zips: Record<string, Uint8Array> = {
      // The fixture resolver treats addresses containing "invalid" as unknown, so the first road fails and the second is tried.
      "06999": county([
        { FULLNAME: "Invalid Ct", LFROMHN: "1", LTOHN: "9", ZIPL: "99901", ROAD_MTFCC: "S1400" },
        { FULLNAME: "Sample Way", LFROMHN: "1", LTOHN: "9", ZIPL: "99901", ROAD_MTFCC: "S1400" },
      ]),
      "48999": county([{ FULLNAME: "Example Rd", LFROMHN: "10", LTOHN: "20", ZIPL: "99902", ROAD_MTFCC: "S1400" }]),
      "56999": county([{ FULLNAME: "Fictional Hwy", LFROMHN: "10", LTOHN: "20", ZIPL: "99903", ROAD_MTFCC: "S1100" }]),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("national_county2020.txt")) return new Response(LIST);
      const fips = /tl_\d{4}_(\d{5})_addrfeat\.zip$/.exec(u)?.[1];
      return fips && zips[fips] ? new Response(zips[fips] as unknown as BodyInit) : new Response("", { status: 404 });
    });
    const runtime = { resolver: new FixtureBallotResolver(() => new Date("2026-10-30T00:00:00Z")) } as unknown as BallotRuntime;
    const out = await runCountySweep({ db: db as never, runtime, election, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(out).toMatchObject({ total: 4, stored: 3, done: 4, finished: true });
    // The finished county isn't downloaded again.
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("39999"))).toBe(false);
    expect(inserted.map((r) => [r.label, r.status, r.run_id === SWEEP_RUN_ID])).toEqual(
      expect.arrayContaining([
        ["CA · Sample County (06999)", expect.not.stringMatching(/INVALID_ADDRESS|ERROR/), true],
        ["WY · Empty County (56999)", "ERROR", true],
      ]),
    );
    expect(inserted.find((r) => r.label === "WY · Empty County (56999)")).toMatchObject({ error: "no residential address ranges" });
    // No street, house number or ZIP from the address ranges is stored.
    expect(JSON.stringify(inserted)).not.toMatch(/Sample Way|Example Rd|Invalid Ct|9990[123]/);
  });
});
