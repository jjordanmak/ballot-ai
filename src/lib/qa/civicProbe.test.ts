import { describe, expect, it, vi } from "vitest";
import type { ElectionRef } from "@/domain/ballot";
import type { GoogleCivicClient } from "@/lib/providers/google-civic/client";
import { makeDbf, makeZip } from "./__fixtures__/tiger";
import { onePerState, PROBE_RUN_ID, runCivicProbe, stateElections } from "./civicProbe";
import { ADDRFEAT_FIELDS } from "./tiger";

const election: ElectionRef = { id: "us-2026-11-03-general", slug: "2026-11-03", name: "General Election", date: "2026-11-03", externalIds: { "google-civic": "9000" } };
const LIST = "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT\nAL|01|999|0|Sample County|H1|A\nAL|01|998|0|Other County|H1|A\nTX|48|999|0|Example County|H1|A\n";
const zip = makeZip({ "x.dbf": makeDbf(ADDRFEAT_FIELDS, [{ FULLNAME: "Sample Way", LFROMHN: "1", LTOHN: "9", ZIPL: "99901", ROAD_MTFCC: "S1400" }]) });

describe("civic probe", () => {
  it("finds a state's own same-day elections", () => {
    const sameDay = [
      { id: "9000", ocdDivisionId: "ocd-division/country:us" },
      { id: "9101", ocdDivisionId: "ocd-division/country:us/state:al" },
      { id: "9102", ocdDivisionId: "ocd-division/country:us/state:al/county:sample" },
      { id: "9200", ocdDivisionId: "ocd-division/country:us/state:tx" },
    ];
    expect(stateElections(sameDay, "AL").map((e) => e.id)).toEqual(["9101", "9102"]);
    expect(stateElections(sameDay, "CA")).toEqual([]);
  });

  it("takes the first county of each state", () => {
    expect(onePerState([{ state: "AL", fips: "1", name: "a" }, { state: "AL", fips: "2", name: "b" }, { state: "TX", fips: "3", name: "c" }]).map((c) => c.fips)).toEqual(["1", "3"]);
  });

  it("records each call's contest counts per state, never the address", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const inserted: Record<string, unknown>[] = [];
    const q = { eq: () => q, range: async () => ({ data: [], error: null }) };
    const db = { from: () => ({ select: () => q, insert: async (rows: Record<string, unknown>[]) => (inserted.push(...rows), { error: null }) }) };
    const contests = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "General", office: `Office ${i}`, district: { name: "Alabama", scope: "statewide", id: "ocd-division/country:us/state:al" }, candidates: [{ name: `Person ${i}` }] }));
    // The national id returns no races; the state's own id returns 3.
    const voterInfoWith = vi.fn(async (_a: unknown, o: { electionId?: string }) => ({
      ok: true as const,
      maxAgeSeconds: undefined,
      body: o.electionId === "9101" ? { election: { id: "9101" }, contests: contests(3), normalizedInput: { state: "AL" } } : { election: { id: o.electionId ?? "9101" }, normalizedInput: { state: "AL" }, otherElections: o.electionId ? [] : [{ id: "9101", ocdDivisionId: "ocd-division/country:us/state:al" }] },
    }));
    const client = {
      elections: async () => ({ ok: true as const, maxAgeSeconds: undefined, body: { elections: [{ id: "9000", electionDay: "2026-11-03", ocdDivisionId: "ocd-division/country:us" }, { id: "9101", electionDay: "2026-11-03", ocdDivisionId: "ocd-division/country:us/state:al" }] } }),
      voterInfoWith,
    } as unknown as GoogleCivicClient;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (String(url).endsWith(".txt") ? new Response(LIST) : new Response(zip as unknown as BodyInit)));
    const out = await runCivicProbe({ db: db as never, election, client, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(out).toMatchObject({ total: 2, done: 2 });
    const al = inserted.find((r) => r.label === "PROBE · AL")!;
    expect(al).toMatchObject({ run_id: PROBE_RUN_ID, status: "PROBE", contest_count: 3 });
    const calls = (al.inventory as { calls: { call: string; raw: number }[] }).calls;
    expect(calls.map((c) => [c.call, c.raw])).toEqual([["national", 0], ["national-no-alldata", 0], ["no-id", 0], ["state:9101", 3]]);
    expect(inserted.find((r) => r.label === "PROBE · elections")).toMatchObject({ contest_count: 2 });
    expect(JSON.stringify(inserted)).not.toMatch(/Sample Way|99901/);
  });
});
