import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { runResearch } from "./run";

/** Just enough of the Supabase query builder for the research job, in memory. */
function fakeDb(seed: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = { sources: [], synthesis_runs: [], synthesized_field_versions: [], api_usage: [], ...seed };
  let n = 0;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  function builder(table: string) {
    const rows = () => (tables[table] ??= []);
    let filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: { kind: "select" } | { kind: "insert"; values: Record<string, unknown>[] } | { kind: "update"; patch: Record<string, unknown> } | { kind: "upsert"; values: Record<string, unknown>[]; key: string } = { kind: "select" };
    let lim = Infinity;
    let from = 0;
    let single: "one" | "maybe" | null = null;
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => ((filters = [...filters, (r) => r[k] === v]), b),
      in: (k: string, vs: unknown[]) => ((filters = [...filters, (r) => vs.includes(r[k])]), b),
      order: () => b,
      range: (a: number, z: number) => ((from = a), (lim = z - a + 1), b),
      limit: (x: number) => ((lim = x), b),
      maybeSingle: () => ((single = "maybe"), b),
      single: () => ((single = "one"), b),
      insert: (v: Record<string, unknown> | Record<string, unknown>[]) => ((op = { kind: "insert", values: [v].flat() }), b),
      update: (patch: Record<string, unknown>) => ((op = { kind: "update", patch }), b),
      upsert: (v: Record<string, unknown>, o: { onConflict: string }) => ((op = { kind: "upsert", values: [v].flat(), key: o.onConflict }), b),
      then: (res: (x: { data: unknown; error: null }) => unknown) => {
        let out: Record<string, unknown>[] = [];
        if (op.kind === "insert") {
          out = op.values.map((v) => ({ id: `id-${++n}`, created_at: new Date(n * 1000).toISOString(), ...v }));
          rows().push(...out);
        } else if (op.kind === "upsert") {
          const key = op.key;
          out = op.values.map((v) => {
            const hit = rows().find((r) => r[key] === v[key]);
            if (hit) return Object.assign(hit, v);
            const row = { id: `id-${++n}`, ...v };
            rows().push(row);
            return row;
          });
        } else if (op.kind === "update") {
          out = rows().filter((r) => filters.every((f) => f(r)));
          for (const r of out) Object.assign(r, (op as { patch: Record<string, unknown> }).patch);
        } else {
          out = rows().filter((r) => filters.every((f) => f(r))).slice(from, from + lim);
        }
        const data = single ? (out[0] ?? null) : out;
        return Promise.resolve(res({ data, error: null }));
      },
    };
    return b;
  }
  const db = {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: 0, error: null });
    },
  };
  return { db: db as unknown as SupabaseClient, tables, rpcCalls };
}

const ANALYSIS = `<html><body><main><h1>Proposition 7</h1>
<p>Under current law, the state charges a 6% tax on sales.</p>
<p>This measure raises the tax to 7.25% and sends the money to road repair.</p>
<p>Fiscal effect: about $2 billion a year in new state revenue.</p>
${"<p>Additional background text for length.</p>".repeat(10)}</main></body></html>`;

const pageFetch = vi.fn(async (url: string) => {
  if (url.includes("/propositions/7/")) return new Response(ANALYSIS, { status: 200, headers: { "content-type": "text/html" } });
  return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
});

function fakeClient() {
  const usage = { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const parse = vi.fn(async (req: { messages: { content: string }[] }) => {
    const content = req.messages[0].content;
    if (content.startsWith("For each numbered item")) {
      return { stop_reason: "end_turn", usage, parsed_output: { results: [{ n: 1, supported: true }, { n: 2, supported: true }] } };
    }
    // The research call sees the documents and only stored entity data.
    expect(content).toContain('<document id="D1"');
    expect(content).toContain("Measure: Proposition 7 (California)");
    return {
      stop_reason: "end_turn",
      usage,
      parsed_output: {
        summary: null,
        yesMeans: null,
        noMeans: null,
        taxes: { text: "Raises the sales tax to <mark>7.25%</mark>.", quote: "This measure raises the tax to 7.25%", sourceId: "D1" },
        cost: { text: "Brings in about $2 billion a year.", quote: "about $2 billion a year in new state revenue", sourceId: "D1" },
        money: { text: "Pays for road repair.", quote: "made-up sentence that is not in the page", sourceId: "D1" },
        affected: null,
        currentLaw: null,
        kind: null,
      },
    };
  });
  return { client: { messages: { parse } } as never, parse };
}

const contests = [
  {
    id: "m-7",
    election_id: "e1",
    kind: "measure",
    contest_type: "referendum",
    title: "Proposition 7",
    division_key: "ocd-division/country:us/state:ca",
    divisions: { name: "California", state: "CA", scope: "statewide" },
    contest_candidates: [],
  },
];

const config = { enabled: true, model: "claude-haiku-5-5", checkModel: "claude-haiku-5-5", monthlyBudgetUsd: 40 };
const resolve = async () => [{ address: "93.184.216.34", family: 4 }];

describe("runResearch", () => {
  it("researches a statewide measure from the official page and publishes only checked answers", async () => {
    const { db, tables, rpcCalls } = fakeDb({ contests });
    const { client, parse } = fakeClient();
    const s = await runResearch({ db, electionId: "e1", config, client, fetchImpl: pageFetch as never, resolve: resolve as never, now: new Date("2026-10-29T07:00:00Z") });

    expect(s).toMatchObject({ targets: 1, researched: 1, published: 1, held: 0, failed: 0 });
    expect(parse).toHaveBeenCalledTimes(2);
    const [v] = tables.synthesized_field_versions as { payload: { answers: Record<string, unknown> }; status: string; is_current: boolean; source_ids: string[] }[];
    expect(v.status).toBe("published");
    expect(v.is_current).toBe(true);
    // The invented quote never made it; the two real ones did.
    expect(Object.keys(v.payload.answers).sort()).toEqual(["cost", "taxes"]);
    expect(v.source_ids).toHaveLength(1);
    expect((tables.sources[0] as { source_type: string }).source_type).toBe("official");
    expect(rpcCalls.find((c) => c.name === "add_api_spend")?.args.p_amount).toBeGreaterThan(0);
  });

  it("skips a target whose documents haven't changed", async () => {
    const { db } = fakeDb({ contests });
    const { client, parse } = fakeClient();
    const opts = { db, electionId: "e1", config, client, fetchImpl: pageFetch as never, resolve: resolve as never, now: new Date("2026-10-29T07:00:00Z") };
    await runResearch(opts);
    const again = await runResearch({ ...opts, now: new Date("2026-10-29T08:00:00Z") });
    expect(again).toMatchObject({ researched: 0, unchanged: 1 });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("stops at the monthly budget", async () => {
    const { db } = fakeDb({ contests, api_usage: [{ period: "2026-10", metric: "anthropic.microusd", count: 40_000_000 }] });
    const { client, parse } = fakeClient();
    const s = await runResearch({ db, electionId: "e1", config, client, fetchImpl: pageFetch as never, resolve: resolve as never, now: new Date("2026-10-29T07:00:00Z") });
    expect(s.stoppedBy).toBe("budget");
    expect(parse).not.toHaveBeenCalled();
  });
});
