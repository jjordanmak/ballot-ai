import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { DEFAULT_COMPARE, aiConfig, type AiConfig } from "@/lib/ai/config";
import { dispatch, jobsFor, runJob } from "./run";
import { buildTargets } from "./targets";

type Row = Record<string, unknown>;

/** Just enough of the Supabase query builder and RPCs for the research job, in memory. */
function fakeDb(seed: Record<string, Row[]>, clock: () => Date, slotWait: () => number = () => 0) {
  const tables: Record<string, Row[]> = { sources: [], synthesis_runs: [], synthesized_field_versions: [], api_usage: [], research_state: [], fetch_hosts: [], ...seed };
  const keys: Record<string, string> = { research_state: "key", fetch_hosts: "host", sources: "url" };
  let n = 0;
  const rpcCalls: { name: string; args: Row }[] = [];

  function builder(table: string) {
    const rows = () => (tables[table] ??= []);
    let filters: ((r: Row) => boolean)[] = [];
    let op: { kind: "select"; head?: boolean } | { kind: "insert"; values: Row[] } | { kind: "update"; patch: Row } | { kind: "upsert"; values: Row[]; key: string; ignore: boolean } = { kind: "select" };
    let lim = Infinity;
    let from = 0;
    let single = false;
    const b = {
      select: (_c?: string, o?: { head?: boolean }) => (op.kind === "select" && o?.head && (op = { kind: "select", head: true }), b),
      eq: (k: string, v: unknown) => ((filters = [...filters, (r) => r[k] === v]), b),
      in: (k: string, vs: unknown[]) => ((filters = [...filters, (r) => vs.includes(r[k])]), b),
      gt: (k: string, v: string) => ((filters = [...filters, (r) => typeof r[k] === "string" && (r[k] as string) > v]), b),
      gte: (k: string, v: string) => ((filters = [...filters, (r) => typeof r[k] === "string" && (r[k] as string) >= v]), b),
      contains: (k: string, vs: unknown[]) => ((filters = [...filters, (r) => Array.isArray(r[k]) && vs.every((v) => (r[k] as unknown[]).includes(v))]), b),
      like: (k: string, p: string) => ((filters = [...filters, (r) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`).test(String(r[k]))]), b),
      order: () => b,
      range: (a: number, z: number) => ((from = a), (lim = z - a + 1), b),
      limit: (x: number) => ((lim = x), b),
      maybeSingle: () => ((single = true), b),
      single: () => ((single = true), b),
      insert: (v: Row | Row[]) => ((op = { kind: "insert", values: [v].flat() }), b),
      update: (patch: Row) => ((op = { kind: "update", patch }), b),
      upsert: (v: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => ((op = { kind: "upsert", values: [v].flat(), key: o?.onConflict ?? keys[table], ignore: !!o?.ignoreDuplicates }), b),
      then: (res: (x: { data: unknown; error: null; count?: number }) => unknown) => {
        let out: Row[] = [];
        if (op.kind === "insert") {
          out = op.values.map((v) => ({ id: `id-${++n}`, ...v }));
          rows().push(...out);
        } else if (op.kind === "upsert") {
          const { key, ignore } = op;
          out = op.values.map((v) => {
            const hit = rows().find((r) => r[key] === v[key]);
            if (hit) return ignore ? hit : Object.assign(hit, v);
            const row = { id: `id-${++n}`, failures: 0, ...v };
            rows().push(row);
            return row;
          });
        } else if (op.kind === "update") {
          out = rows().filter((r) => filters.every((f) => f(r)));
          for (const r of out) Object.assign(r, (op as { patch: Row }).patch);
        } else {
          out = rows().filter((r) => filters.every((f) => f(r)));
          if (op.head) return Promise.resolve(res({ data: null, error: null, count: out.length }));
          out = out.slice(from, from + lim);
        }
        return Promise.resolve(res({ data: single ? (out[0] ?? null) : out, error: null }));
      },
    };
    return b;
  }
  const db = {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Row) => {
      rpcCalls.push({ name, args });
      if (name === "claim_research_jobs") {
        // Due and unlocked, by the database's clock.
        const now = clock().toISOString();
        const due = tables.research_state
          .filter((r) => (args.p_keys as string[]).includes(r.key as string))
          .filter((r) => !r.next_check_at || (r.next_check_at as string) <= now)
          .filter((r) => !r.locked_until || (r.locked_until as string) <= now)
          .slice(0, args.p_limit as number);
        for (const r of due) r.locked_until = new Date(clock().getTime() + (args.p_lock_seconds as number) * 1000).toISOString();
        return Promise.resolve({ data: due.map((r) => r.key), error: null });
      }
      if (name === "reserve_host_slot") return Promise.resolve({ data: slotWait(), error: null });
      return Promise.resolve({ data: 0, error: null });
    },
  };
  return { db: db as unknown as SupabaseClient, tables, rpcCalls };
}

const ANALYSIS = `<html><body><main><h1>Proposition 7</h1>
<p>Under current law, the state charges a 6% tax on sales.</p>
<p>This measure raises the tax to 7.25% and sends the money to road repair.</p>
<p>Fiscal effect: about $2 billion a year in new state revenue.</p>
<p><a href="/propositions/7/analysis/">Analysis by the Legislative Analyst</a></p>
${"<p>Additional background text for length.</p>".repeat(10)}</main></body></html>`;

const LAO = `<html><body><main><h1>Proposition 7: Analysis by the Legislative Analyst</h1>
<p>LAO-MARKER. Background: the state sales tax funds the general fund.</p>
${"<p>More of the official analysis, for length.</p>".repeat(10)}</main></body></html>`;

function pageFetch(robots = "") {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/robots.txt")) return robots ? new Response(robots, { status: 200, headers: { "content-type": "text/plain" } }) : new Response("", { status: 404 });
    if (url.includes("/propositions/7/analysis/")) return new Response(LAO, { status: 200, headers: { "content-type": "text/html" } });
    if (url.includes("/propositions/7/")) return new Response(ANALYSIS, { status: 200, headers: { "content-type": "text/html", etag: '"v1"' } });
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });
}

type Msg = { role: string; content: string | { type: string; text: string }[] };
type Req = { model: string; system: string | { text: string }[]; output_config: { effort: string }; messages: Msg[] };
const textOf = (m: Msg) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join(""));
const systemOf = (r: Req) => (typeof r.system === "string" ? r.system : r.system.map((b) => b.text).join(""));
/** Which call this is: the writer, its repair, the verifier, the reviewer. */
function kindOf(r: Req): "write" | "repair" | "verify" | "review" | "rewrite" {
  const sys = systemOf(r);
  if (sys.startsWith("You check summaries")) return "verify";
  if (sys.startsWith("You review text")) return "review";
  if (sys.startsWith("You edit sentences")) return "rewrite";
  return r.messages.length > 1 ? "repair" : "write";
}
const allSupported = (r: Req) => ({ results: [...textOf(r.messages[0]).matchAll(/^(\d+)\. Text:/gm)].map((m) => ({ n: Number(m[1]), supported: true })) });

function fakeClient() {
  const usage = { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const parse = vi.fn(async (req: Req) => {
    const kind = kindOf(req);
    if (kind === "verify") return { stop_reason: "end_turn", usage, parsed_output: allSupported(req) };
    if (kind === "review") return { stop_reason: "end_turn", usage, parsed_output: { flags: [] } };
    const content = textOf(req.messages[0]);
    // The writer sees the documents (cached, for the repair pass) and only stored entity data.
    expect(content).toContain('<document id="D1"');
    expect(content).toContain("Measure: Proposition 7 (California)");
    expect(typeof req.messages[0].content).not.toBe("string");
    if (kind === "repair") {
      expect(textOf(req.messages[2])).toContain("money.0: Pays for road repair.");
      return { stop_reason: "end_turn", usage, parsed_output: { units: [{ id: "money.0", text: "Sends the money to road repair.", refs: [{ sourceId: "D1", excerpt: "sends the money to road repair" }] }] } };
    }
    return {
      stop_reason: "end_turn",
      usage,
      parsed_output: {
        sections: [
          {
            section: "taxes",
            sentences: [
              {
                text: "Raises the state sales tax from 6% to <mark>7.25%</mark>.",
                refs: [
                  { sourceId: "D1", excerpt: "the state charges a 6% tax on sales" },
                  { sourceId: "D1", excerpt: "This measure raises the tax to 7.25%" },
                ],
              },
            ],
          },
          { section: "cost", sentences: [{ text: "Brings in about $2 billion a year.", refs: [{ sourceId: "D1", excerpt: "about $2 billion a year in new state revenue" }] }] },
          { section: "money", sentences: [{ text: "Pays for road repair.", refs: [{ sourceId: "D1", excerpt: "made-up sentence that is not in the page" }] }] },
        ],
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
const KEY = "measure:m-7:measure";

const base = aiConfig({ AI_SYNTHESIS_ENABLED: "on", ANTHROPIC_API_KEY: "test" });
const publishCfg: AiConfig = { ...base, mode: "publish" };
const compareCfg: AiConfig = { ...base, mode: "compare", compare: [{ model: "claude-haiku-5-5", effort: "low" }, { model: "claude-opus-5-5", effort: "high" }] };
const writes = (p: { mock: { calls: unknown[][] } }) => p.mock.calls.map((c) => c[0] as Req).filter((r) => kindOf(r) === "write");
const resolve = async () => [{ address: "93.184.216.34", family: 4 }];

function setup(seed: Record<string, Row[]> = {}, robots = "", slotWait: () => number = () => 0) {
  let now = new Date("2026-10-29T07:00:00Z");
  const clock = () => now;
  const fake = fakeDb({ contests, ...seed }, clock, slotWait);
  const { client, parse } = fakeClient();
  const deps = (config: AiConfig) => ({
    db: fake.db,
    electionId: "e1",
    config,
    client,
    fetchImpl: pageFetch(robots) as never,
    resolve: resolve as never,
    sleep: async () => {},
    compareKeys: [KEY],
    get now() {
      return clock();
    },
  });
  return { ...fake, parse, deps, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("jobsFor", () => {
  const targets = buildTargets(contests as never);
  it("compare mode: every setting for each item in the comparison set, nothing else", () => {
    const jobs = jobsFor({ ...base, mode: "compare", compare: DEFAULT_COMPARE }, targets, "e1", [KEY]);
    expect(jobs).toHaveLength(9);
    expect(jobs.every((j) => j.compare)).toBe(true);
    expect(jobs.map((j) => j.stateKey)).toContain("measure:m-7:measure@claude-sonnet-5-5:high");
    expect(jobsFor({ ...base, mode: "compare" }, targets, "e1", ["measure:other:measure"])).toHaveLength(0);
  });
  it("publish mode: every target once, at its kind's setting", () => {
    const jobs = jobsFor({ ...publishCfg, publish: { ...publishCfg.publish, measure: { model: "claude-sonnet-5-5", effort: "low" } } }, targets, "e1");
    expect(jobs).toEqual([expect.objectContaining({ stateKey: KEY, compare: false, setting: { model: "claude-sonnet-5-5", effort: "low" } })]);
  });
});

describe("dispatch", () => {
  it("records new jobs, claims the due ones up to the in-flight limit, and fans them out", async () => {
    const s = setup();
    const ran: string[] = [];
    const first = await dispatch({ ...s.deps({ ...compareCfg, maxInflight: 1 }), runRemote: async (k) => void ran.push(k) });
    expect(first).toMatchObject({ jobs: 2, claimed: 1 });
    expect(s.tables.research_state.map((r) => r.key).sort()).toEqual([`${KEY}@claude-haiku-5-5:low`, `${KEY}@claude-opus-5-5:high`]);
    // The claimed job is locked: the next minute's run takes the other one only.
    s.advance(60_000);
    await dispatch({ ...s.deps({ ...compareCfg, maxInflight: 2 }), runRemote: async (k) => void ran.push(k) });
    expect(new Set(ran).size).toBe(2);
    expect(ran).toHaveLength(2);
  });

  it("does nothing when switched off or over budget", async () => {
    const off = setup();
    expect(await dispatch({ ...off.deps({ ...compareCfg, enabled: false }) })).toMatchObject({ stoppedBy: "disabled" });
    const broke = setup({ api_usage: [{ period: "2026-10", metric: "anthropic.microusd", count: 40_000_000 }] });
    const run = vi.fn();
    expect(await dispatch({ ...broke.deps(compareCfg), runRemote: run })).toMatchObject({ stoppedBy: "budget", claimed: 0 });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("runJob", () => {
  it("publish mode: writes from the official page, repairs what fails once, and publishes only checked sentences", async () => {
    const s = setup();
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    const r = await runJob(s.deps(publishCfg), KEY);
    expect(r.outcome).toBe("published");
    // Write, verify, review; one repair for the excerpt that isn't in the page; verify and review the repair.
    expect(s.parse.mock.calls.map((c) => kindOf(c[0] as Req))).toEqual(["write", "verify", "review", "repair", "verify", "review"]);
    const [v] = s.tables.synthesized_field_versions as {
      field_name: string;
      payload: { v: number; sections: Record<string, { text: string; refs: { excerpt: string }[] }[]>; limited: string[]; scope: unknown };
      status: string;
      is_current: boolean;
    }[];
    expect(v).toMatchObject({ field_name: "measure", status: "published", is_current: true });
    expect(v.payload.v).toBe(2);
    expect(Object.keys(v.payload.sections).sort()).toEqual(["cost", "money", "taxes"]);
    expect(v.payload.sections.money[0].text).toBe("Sends the money to road repair.");
    // Each sentence carries its excerpts for the [n] popovers.
    expect(v.payload.sections.taxes[0].refs.map((x) => x.excerpt)).toEqual(["the state charges a 6% tax on sales", "This measure raises the tax to 7.25%"]);
    expect(v.payload.limited).toContain("summary");
    expect(v.payload.scope).toEqual({ election: "e1", state: "CA" });
    expect((s.tables.sources[0] as { source_type: string }).source_type).toBe("official");
    expect(s.rpcCalls.find((c) => c.name === "add_api_spend")?.args.p_amount).toBeGreaterThan(0);
    // Polite: robots.txt was read and the site's slot reserved before the page.
    expect(s.tables.fetch_hosts[0]).toMatchObject({ host: "voterguide.sos.ca.gov" });
    // The job says how long it will wait, so the database never reserves a slot it won't use (0013).
    expect(s.rpcCalls.filter((c) => c.name === "reserve_host_slot").every((c) => c.args.p_max_wait_ms === 25_000)).toBe(true);
    const state = s.tables.research_state.find((x) => x.key === KEY)!;
    expect(state).toMatchObject({ last_outcome: "published", locked_until: null });
    expect(Date.parse(state.next_check_at as string)).toBeGreaterThanOrEqual(Date.parse("2026-10-29T13:00:00Z"));
  });

  it("compare mode: each setting's result is held under its own field, with its effort, cost and time", async () => {
    const s = setup();
    await dispatch({ ...s.deps(compareCfg), runRemote: async () => {} });
    for (const k of [`${KEY}@claude-haiku-5-5:low`, `${KEY}@claude-opus-5-5:high`]) expect((await runJob(s.deps(compareCfg), k)).outcome).toBe("compared");
    expect(writes(s.parse).map((req) => [req.model, req.output_config.effort])).toEqual([
      ["claude-haiku-5-5", "low"],
      ["claude-opus-5-5", "high"],
    ]);
    const rows = s.tables.synthesized_field_versions as { field_name: string; status: string; held_reason: string }[];
    expect(rows.map((r) => r.field_name).sort()).toEqual(["measure@claude-haiku-5-5:low", "measure@claude-opus-5-5:high"]);
    expect(rows.every((r) => r.status === "held" && r.held_reason === "model comparison")).toBe(true);
    const runs = s.tables.synthesis_runs as { metadata: { setting: unknown; costMicroUsd: number; seconds: number; rejected: { reason: string }[] } }[];
    expect(runs[1].metadata).toMatchObject({ setting: { model: "claude-opus-5-5", effort: "high" } });
    expect(runs[1].metadata.costMicroUsd).toBeGreaterThan(runs[0].metadata.costMicroUsd);
    expect(runs[0].metadata.rejected).toEqual([]);
    // The pages were read once and shared by both settings.
    expect(s.tables.sources.map((x) => x.url).sort()).toEqual(["https://voterguide.sos.ca.gov/propositions/7/", "https://voterguide.sos.ca.gov/propositions/7/analysis/"]);
  });

  it("compare mode: every setting reads the same documents, including the pages the first one followed", async () => {
    const s = setup();
    await dispatch({ ...s.deps(compareCfg), runRemote: async () => {} });
    for (const k of [`${KEY}@claude-haiku-5-5:low`, `${KEY}@claude-opus-5-5:high`]) await runJob(s.deps(compareCfg), k);
    const docsSent = writes(s.parse)
      .map((r) => textOf(r.messages[0]))
      .map((content) => content.slice(0, content.lastIndexOf("</document>")));
    expect(docsSent).toHaveLength(2);
    expect(docsSent[0]).toContain("LAO-MARKER");
    expect(docsSent[1]).toBe(docsSent[0]);
  });

  it("waits when a site is too busy instead of running on fewer documents, then runs", async () => {
    let wait = 60_000;
    const s = setup({}, "", () => wait);
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("waiting");
    expect(s.parse).not.toHaveBeenCalled();
    wait = 0;
    s.advance(2 * 60_000);
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("published");
  });

  it("skips a job whose documents haven't changed", async () => {
    const s = setup();
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    await runJob(s.deps(publishCfg), KEY);
    s.advance(7 * 3600_000);
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("unchanged");
    expect(writes(s.parse)).toHaveLength(1);
  });

  it("honors robots.txt: a disallowed site isn't read, and with nothing else there's nothing to run", async () => {
    const s = setup({}, "User-agent: *\nDisallow: /propositions/");
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("no documents");
    expect(s.parse).not.toHaveBeenCalled();
  });

  it("a highlight the reviewer objects to loses its mark, not the sentence", async () => {
    const s = setup();
    const inner = fakeClient();
    const parse = vi.fn(async (req: Req) => {
      if (kindOf(req) === "review") return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { flags: [{ id: "taxes.0", reason: "highlight on a contestable phrase", highlightOnly: true }] } };
      return inner.parse(req);
    });
    const deps = { ...s.deps(publishCfg), client: { messages: { parse } } as never };
    await dispatch({ ...deps, runRemote: async () => {} });
    expect((await runJob(deps, KEY)).outcome).toBe("published");
    const [v] = s.tables.synthesized_field_versions as { payload: { sections: Record<string, { text: string }[]> } }[];
    expect(v.payload.sections.taxes[0].text).toBe("Raises the state sales tax from 6% to 7.25%.");
  });

  it("reads the news coverage the feed matched to a race or person, never for a measure", async () => {
    const s = setup({ feed_items: [{ url: "https://calmatters.org/a", publisher: "CalMatters", type: "news", status: "published", contest_ids: ["m-7"], candidate_ids: [], published_at: "2026-10-20T00:00:00Z" }] });
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    await runJob(s.deps(publishCfg), KEY);
    expect(s.tables.sources.map((x) => x.url)).not.toContain("https://calmatters.org/a");
  });

  it("keeps the API's error message on a rejected request, so it can be diagnosed", async () => {
    const s = setup();
    const err = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Schema is too complex for compilation." } }, "Schema is too complex for compilation.", new Headers());
    const parse = vi.fn(async () => {
      throw err;
    });
    const deps = { ...s.deps(publishCfg), client: { messages: { parse } } as never };
    await dispatch({ ...deps, runRemote: async () => {} });
    expect((await runJob(deps, KEY)).outcome).toBe("failed");
    const run = (s.tables.synthesis_runs as { error: string }[])[0];
    expect(run.error).toMatch(/^api_400: .*Schema is too complex for compilation/);
  });

  it("stops at the monthly budget", async () => {
    const s = setup();
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    s.tables.api_usage.push({ period: "2026-10", metric: "anthropic.microusd", count: 40_000_000 });
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("budget");
    expect(s.parse).not.toHaveBeenCalled();
  });
});

describe("runJob: people and races (written sections, every sentence checked)", () => {
  const CAMPAIGN = `<html><body><main><h1>About Ann Bee</h1>
<p>Ann Bee earned a Bachelor of Arts degree in history from the University of Michigan.</p>
<p>She has served on the Springfield City Council since 2019.</p>
<p>Before that, she was a public school teacher from 2005 to 2018.</p>
<p>As mayor, I will expand bus service to every neighborhood.</p>
<p>Ann is the daughter of two nurses.</p>
${"<p>More about the campaign, for length.</p>".repeat(8)}</main></body></html>`;
  const candidateContests = [
    {
      id: "c-mayor",
      election_id: "e1",
      kind: "candidate",
      contest_type: "general",
      title: "Mayor",
      division_key: "ocd-division/country:us/state:il/place:springfield",
      divisions: { name: "City of Springfield", state: "IL", scope: "citywide" },
      contest_candidates: [
        { id: "k-bee", ballot_name: "ANN BEE", display_name: "Ann Bee", campaign_url: "https://annbee.example.org/", party: null },
        { id: "k-cole", ballot_name: "CY COLE", display_name: "Cy Cole", campaign_url: null, party: null },
      ],
    },
  ];
  const PKEY = "candidate:k-bee:profile";
  const RKEY = "race:c-mayor:race";
  const SETTING = "claude-haiku-5-5:low";
  const usage = { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ref = (excerpt: string) => [{ sourceId: "D1", excerpt }];
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    if (url.startsWith("https://annbee.example.org/")) return new Response(CAMPAIGN, { status: 200, headers: { "content-type": "text/html" } });
    if (url.startsWith("https://www.springfield.il.gov/elections")) return new Response(CITY, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });
  const CITY = `<html><body><main><h1>City election</h1>
<p>The mayor of Springfield is elected to a four-year term and prepares the city budget.</p>
<p>The incumbent mayor is not running, so the seat is open.</p>
${"<p>More about the city election, for length.</p>".repeat(8)}</main></body></html>`;

  it("people: lists checked field by field, sections written and checked, a failed sentence repaired once then dropped", async () => {
    const now = new Date("2026-10-29T07:00:00Z");
    const fake = fakeDb({ contests: candidateContests }, () => now);
    let lists = 0;
    const parse = vi.fn(async (req: Req) => {
      const kind = kindOf(req);
      if (kind === "verify") return { stop_reason: "end_turn", usage, parsed_output: allSupported(req) };
      if (kind === "review") return { stop_reason: "end_turn", usage, parsed_output: { flags: [] } };
      if (kind === "repair") {
        // Only the failing sentence comes back for repair; the model can't support it, so it leaves it out.
        expect(textOf(req.messages[2])).toContain("background.1: She is the daughter of two nurses.");
        return { stop_reason: "end_turn", usage, parsed_output: { units: [] } };
      }
      const content = textOf(req.messages[0]);
      // Both calls send the documents as their own cached block, ahead of the task.
      const blocks = req.messages[0].content as { text: string; cache_control?: unknown }[];
      expect(blocks[0].text).toContain('<document id="D1"');
      expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
      if (content.includes("Return their lists only")) {
        lists++;
        expect(content).toContain("Residence: the city or area where they live");
        expect(content).toContain("Leave out, for everyone: family background");
        return {
          stop_reason: "end_turn",
          usage,
          parsed_output: {
            education: [
            { degree: "Bachelor of Arts", field: "History", institution: "University of Michigan", year: null, quote: "Ann Bee earned a Bachelor of Arts degree in history from the University of Michigan.", sourceId: "D1" },
            { degree: "J.D.", field: null, institution: "Harvard Law School", year: null, quote: "Ann Bee earned a Bachelor of Arts degree in history from the University of Michigan.", sourceId: "D1" },
          ],
          positions: [
            { title: "Member", organization: "Springfield City Council", district: null, startYear: 2019, endYear: "present", type: "elected", committees: [], quote: "She has served on the Springfield City Council since 2019.", sourceId: "D1" },
            { title: "Teacher", organization: "public school", district: null, startYear: 2005, endYear: "2018", type: "job", committees: [], quote: "Before that, she was a public school teacher from 2005 to 2018.", sourceId: "D1" },
          ],
            residence: null,
            leftOut: [{ fact: "Daughter of two nurses", reason: "family background" }],
          },
        };
      }
      // The writer gets only the checked positions (the Harvard degree and anything unchecked are gone), as P0, P1….
      expect(content).toContain("P0: Member, Springfield City Council (2019–present)");
      expect(content).toContain("P1: Teacher, public school (2005–2018)");
      return {
        stop_reason: "end_turn",
        usage,
        parsed_output: {
          sections: [
            { section: "inBrief", sentences: [{ text: "Ann Bee has served on the <mark>Springfield City Council</mark> for {{years:P0}}.", refs: ref("She has served on the Springfield City Council since 2019.") }] },
            {
              section: "background",
              sentences: [
                { text: "She was a public school teacher from 2005 to 2018.", refs: ref("Before that, she was a public school teacher from 2005 to 2018.") },
                { text: "She is the daughter of two nurses.", refs: ref("Ann is the daughter of two nurses.") },
              ],
            },
            { section: "priorities", sentences: [{ text: "Bus service in every neighborhood", refs: ref("As mayor, I will expand bus service to every neighborhood.") }] },
            { section: "stances", sentences: [] },
          ],
          mightFit: [{ issue: "Transit", text: "want bus service in every neighborhood", refs: ref("As mayor, I will expand bus service to every neighborhood.") }],
          timeline: [{ when: "2019", event: "Joined the Springfield City Council", refs: ref("She has served on the Springfield City Council since 2019.") }],
          endorsements: [],
        },
      };
    });
    const deps = { db: fake.db, electionId: "e1", config: compareCfg, client: { messages: { parse } } as never, fetchImpl: fetchImpl as never, resolve: resolve as never, sleep: async () => {}, compareKeys: [PKEY], now };
    await dispatch({ ...deps, runRemote: async () => {} });
    expect((await runJob(deps, `${PKEY}@${SETTING}`)).outcome).toBe("compared");
    expect(lists).toBe(1);
    expect(parse.mock.calls.map((c) => kindOf(c[0] as Req))).toEqual(["write", "write", "verify", "review", "repair"]);

    const [v] = fake.tables.synthesized_field_versions as { field_name: string; payload: Record<string, unknown>; status: string }[];
    expect(v).toMatchObject({ field_name: `profile@${SETTING}`, status: "held" });
    expect(v.payload).toMatchObject({
      kind: "person",
      v: 3,
      education: [{ degree: "Bachelor of Arts", field: "History", institution: "University of Michigan" }],
      positions: [
        { title: "Member", organization: "Springfield City Council", startYear: 2019, endYear: "present" },
        { title: "Teacher", startYear: 2005, endYear: 2018 },
      ],
      sections: {
        // Code writes the duration from the verified years; the model never does.
        inBrief: [{ text: "Ann Bee has served on the <mark>Springfield City Council</mark> for 7 years." }],
        background: [{ text: "She was a public school teacher from 2005 to 2018." }],
        priorities: [{ text: "Bus service in every neighborhood" }],
      },
      mightFit: [{ text: "…want bus service in every neighborhood", issue: "Transit" }],
      timeline: [{ when: "2019", text: "Joined the Springfield City Council" }],
      limited: ["stances", "mightFit", "endorsements"],
    });
    const run = (fake.tables.synthesis_runs as { metadata: { rejected: { field: string; detail?: string; text?: string }[]; leftOut: unknown[]; tried: { outcome: string }[] } }[])[0];
    expect(run.metadata.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "education.1", detail: "institution not in quote" }),
        expect.objectContaining({ field: "background.1", detail: "neutrality: family background", text: "She is the daughter of two nurses." }),
      ]),
    );
    expect(run.metadata.leftOut).toEqual([{ fact: "Daughter of two nurses", reason: "family background" }]);
    expect(run.metadata.tried.some((t) => t.outcome === "read")).toBe(true);
  });

  it("races: wait for the candidates, write the intro, then rewrite unequal sentences instead of cutting them", async () => {
    let now = new Date("2026-10-29T07:00:00Z");
    const person = (bg: string) => ({ kind: "person", v: 3, education: [], positions: [], sections: { background: [{ text: bg, refs: [{ source: "s1", excerpt: "She has served on the Springfield City Council since 2019." }] }] }, mightFit: [], timeline: [], endorsements: [], limited: [], sources: {} });
    const fake = fakeDb(
      {
        contests: candidateContests,
        // The race's search already ran (shared document set): the city's election page.
        research_state: [{ key: `${RKEY}#search`, target: {}, discovered: { v: 2, urls: ["https://www.springfield.il.gov/elections"], at: now.toISOString(), searchedAt: now.toISOString() }, failures: 0 }],
      },
      () => now,
    );
    const calls: string[] = [];
    const parse = vi.fn(async (req: Req) => {
      const kind = kindOf(req);
      calls.push(kind);
      if (kind === "verify") return { stop_reason: "end_turn", usage, parsed_output: allSupported(req) };
      if (kind === "review") {
        const task = textOf(req.messages[0]);
        // The fairness pass sees every candidate side by side.
        if (task.includes("treat candidates unequally")) {
          expect(task).toContain("c1/background.0");
          expect(task).toContain("c2/background.0");
          return { stop_reason: "end_turn", usage, parsed_output: { flags: [{ id: "c1/background.0", reason: "title used for one candidate only" }] } };
        }
        return { stop_reason: "end_turn", usage, parsed_output: { flags: [] } };
      }
      if (kind === "rewrite") return { stop_reason: "end_turn", usage, parsed_output: { units: [{ id: "c1/background.0", text: "Bee has served on the Springfield City Council since 2019.", refs: [] }] } };
      if (kind === "repair") {
        // Thin sections get filled: one cited sentence, one uncited explanation (owner, 2026-10-30).
        expect(textOf(req.messages[2])).toMatch(/empty or thin: .*whatsAtStake.*bigPicture/);
        return {
          stop_reason: "end_turn",
          usage,
          parsed_output: {
            units: [
              { id: "bigPicture.new1", text: "Springfield elects its mayor to a 4-year term.", refs: [{ sourceId: "D1", excerpt: "The mayor of Springfield is elected to a four-year term" }] },
              { id: "whatsAtStake.new1", text: "The next mayor will shape how the city spends its money.", refs: [] },
              { id: "whatsAtStake.new2", text: "Ann Bee would expand bus service.", refs: [] },
            ],
          },
        };
      }
      // The ballot data (candidates and their parties) is given to the writer as always true.
      expect(textOf(req.messages[0])).toContain("Candidates on the ballot: Ann Bee, Cy Cole.");
      return {
        stop_reason: "end_turn",
        usage,
        parsed_output: {
          sections: [
            { section: "context", sentences: [{ text: "The seat is open because the incumbent mayor is not running.", refs: [{ sourceId: "D1", excerpt: "The incumbent mayor is not running, so the seat is open." }] }] },
            { section: "whyItMatters", sentences: [{ text: "The mayor prepares the <mark>city budget</mark>.", refs: [{ sourceId: "D1", excerpt: "prepares the city budget" }] }] },
            { section: "whatsAtStake", sentences: [] },
            { section: "bigPicture", sentences: [] },
          ],
        },
      };
    });
    const deps = (n: Date) => ({ db: fake.db, electionId: "e1", config: compareCfg, client: { messages: { parse } } as never, fetchImpl: fetchImpl as never, resolve: resolve as never, sleep: async () => {}, compareKeys: [RKEY], now: n });
    await dispatch({ ...deps(now), runRemote: async () => {} });
    // No candidate results yet: wait.
    expect((await runJob(deps(now), `${RKEY}@${SETTING}`)).outcome).toBe("waiting");
    expect(parse).not.toHaveBeenCalled();
    const field = `profile@${SETTING}`;
    fake.tables.synthesized_field_versions.push(
      { target_type: "candidate", target_id: "k-bee", field_name: field, is_current: true, content: "a", payload: person("Councilmember Ann Bee has served on the Springfield City Council since 2019.") },
      { target_type: "candidate", target_id: "k-cole", field_name: field, is_current: true, content: "b", payload: person("Cole has served on the Springfield City Council since 2019.") },
    );
    now = new Date(now.getTime() + 3 * 60_000);
    expect((await runJob(deps(now), `${RKEY}@${SETTING}`)).outcome).toBe("compared");
    const row = (fake.tables.synthesized_field_versions as { target_type: string; payload: { kind: string; sections: Record<string, unknown[]>; limited: string[]; parity: { rewrites: unknown[]; unresolved: unknown[] } } }[]).find((r) => r.target_type === "race")!;
    expect(row.payload.kind).toBe("race");
    expect(Object.keys(row.payload.sections).sort()).toEqual(["bigPicture", "context", "whatsAtStake", "whyItMatters"]);
    expect(row.payload.limited).toEqual([]);
    // An uncited explanation is kept without a source; an uncited sentence about a candidate isn't.
    const stake = (row.payload.sections as Record<string, { text: string; refs: unknown[] }[]>).whatsAtStake;
    expect(stake).toEqual([{ text: "The next mayor will shape how the city spends its money.", refs: [] }]);
    expect(row.payload.parity.rewrites).toEqual([
      expect.objectContaining({ target: "k-bee", unit: "background.0", text: "Bee has served on the Springfield City Council since 2019." }),
    ]);
    expect(row.payload.parity.unresolved).toEqual([]);
    expect(calls).toEqual(["write", "verify", "review", "repair", "verify", "review", "review", "rewrite", "verify", "review"]);
  });
});
