import { describe, expect, it, vi } from "vitest";
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

function fakeClient() {
  const usage = { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const parse = vi.fn(async (req: { model: string; output_config: { effort: string }; messages: { content: string }[] }) => {
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
const KEY = "measure:m-7:measure";

const base = aiConfig({ AI_SYNTHESIS_ENABLED: "on", ANTHROPIC_API_KEY: "test" });
const publishCfg: AiConfig = { ...base, mode: "publish" };
const compareCfg: AiConfig = { ...base, mode: "compare", compare: [{ model: "claude-haiku-5-5", effort: "low" }, { model: "claude-opus-5-5", effort: "high" }] };
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
  it("publish mode: researches from the official page and publishes only checked answers", async () => {
    const s = setup();
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    const r = await runJob(s.deps(publishCfg), KEY);
    expect(r.outcome).toBe("published");
    expect(s.parse).toHaveBeenCalledTimes(2);
    const [v] = s.tables.synthesized_field_versions as { field_name: string; payload: { answers: Record<string, unknown>; scope: unknown }; status: string; is_current: boolean; source_ids: string[] }[];
    expect(v).toMatchObject({ field_name: "measure", status: "published", is_current: true });
    // The invented quote never made it; the two real ones did.
    expect(Object.keys(v.payload.answers).sort()).toEqual(["cost", "taxes"]);
    expect(v.payload.scope).toEqual({ election: "e1", state: "CA" });
    expect((s.tables.sources[0] as { source_type: string }).source_type).toBe("official");
    expect(s.rpcCalls.find((c) => c.name === "add_api_spend")?.args.p_amount).toBeGreaterThan(0);
    // Polite: robots.txt was read and the site's slot reserved before the page.
    expect(s.tables.fetch_hosts[0]).toMatchObject({ host: "voterguide.sos.ca.gov" });
    expect(s.rpcCalls.some((c) => c.name === "reserve_host_slot")).toBe(true);
    const state = s.tables.research_state.find((x) => x.key === KEY)!;
    expect(state).toMatchObject({ last_outcome: "published", locked_until: null });
    expect(Date.parse(state.next_check_at as string)).toBeGreaterThanOrEqual(Date.parse("2026-10-29T13:00:00Z"));
  });

  it("compare mode: each setting's result is held under its own field, with its effort, cost and time", async () => {
    const s = setup();
    await dispatch({ ...s.deps(compareCfg), runRemote: async () => {} });
    for (const k of [`${KEY}@claude-haiku-5-5:low`, `${KEY}@claude-opus-5-5:high`]) expect((await runJob(s.deps(compareCfg), k)).outcome).toBe("compared");
    const research = s.parse.mock.calls.map((c) => c[0]).filter((req) => !req.messages[0].content.startsWith("For each"));
    expect(research.map((req) => [req.model, req.output_config.effort])).toEqual([
      ["claude-haiku-5-5", "low"],
      ["claude-opus-5-5", "high"],
    ]);
    const rows = s.tables.synthesized_field_versions as { field_name: string; status: string; held_reason: string }[];
    expect(rows.map((r) => r.field_name).sort()).toEqual(["measure@claude-haiku-5-5:low", "measure@claude-opus-5-5:high"]);
    expect(rows.every((r) => r.status === "held" && r.held_reason === "model comparison")).toBe(true);
    const runs = s.tables.synthesis_runs as { metadata: { setting: unknown; costMicroUsd: number; seconds: number; rejected: { reason: string }[] } }[];
    expect(runs[1].metadata).toMatchObject({ setting: { model: "claude-opus-5-5", effort: "high" } });
    expect(runs[1].metadata.costMicroUsd).toBeGreaterThan(runs[0].metadata.costMicroUsd);
    expect(runs[0].metadata.rejected).toEqual([expect.objectContaining({ reason: "quote not found" })]);
    // The pages were read once and shared by both settings.
    expect(s.tables.sources.map((x) => x.url).sort()).toEqual(["https://voterguide.sos.ca.gov/propositions/7/", "https://voterguide.sos.ca.gov/propositions/7/analysis/"]);
  });

  it("compare mode: every setting reads the same documents, including the pages the first one followed", async () => {
    const s = setup();
    await dispatch({ ...s.deps(compareCfg), runRemote: async () => {} });
    for (const k of [`${KEY}@claude-haiku-5-5:low`, `${KEY}@claude-opus-5-5:high`]) await runJob(s.deps(compareCfg), k);
    const docsSent = s.parse.mock.calls
      .map((c) => c[0].messages[0].content)
      .filter((content) => !content.startsWith("For each"))
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
    expect(s.parse).toHaveBeenCalledTimes(2);
  });

  it("honors robots.txt: a disallowed site isn't read, and with nothing else there's nothing to run", async () => {
    const s = setup({}, "User-agent: *\nDisallow: /propositions/");
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("no documents");
    expect(s.parse).not.toHaveBeenCalled();
  });

  it("stops at the monthly budget", async () => {
    const s = setup();
    await dispatch({ ...s.deps(publishCfg), runRemote: async () => {} });
    s.tables.api_usage.push({ period: "2026-10", metric: "anthropic.microusd", count: 40_000_000 });
    expect((await runJob(s.deps(publishCfg), KEY)).outcome).toBe("budget");
    expect(s.parse).not.toHaveBeenCalled();
  });
});

describe("runJob: people (facts, then a bio from the facts)", () => {
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
      contest_candidates: [{ id: "k-bee", ballot_name: "ANN BEE", display_name: "Ann Bee", campaign_url: "https://annbee.example.org/" }],
    },
  ];
  const PKEY = "candidate:k-bee:profile";

  it("checks each fact against its quote, writes the bio only from kept facts, and stores the quotes for the popovers", async () => {
    let now = new Date("2026-10-29T07:00:00Z");
    const fake = fakeDb({ contests: candidateContests }, () => now);
    const usage = { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tasks: string[] = [];
    const parse = vi.fn(async (req: { system: { text: string }[]; messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      tasks.push(content.slice(0, 40));
      if (content.startsWith("For each numbered item")) return { stop_reason: "end_turn", usage, parsed_output: { results: [{ n: 1, supported: true }] } };
      if (content.startsWith("Write 3 to 5 sentences")) {
        // The bio writer sees the checked facts only, never the documents.
        expect(content).not.toContain("<document");
        expect(content).toContain("P0: Member, Springfield City Council · 2019–present");
        expect(content).not.toContain("Harvard");
        return {
          stop_reason: "end_turn",
          usage,
          parsed_output: {
            sentences: [
              { text: "Ann Bee has served on the Springfield City Council since 2019.", facts: ["P0"] },
              { text: "She was a teacher from 2005 to 2018.", facts: ["P1"] },
              { text: "She is the daughter of two nurses.", facts: ["P1"] },
            ],
          },
        };
      }
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
          platform: [{ text: "Says she will expand bus service to every neighborhood.", quote: "As mayor, I will expand bus service to every neighborhood.", sourceId: "D1" }],
          residence: null,
          leftOut: [{ fact: "Daughter of two nurses", reason: "family background" }],
        },
      };
    });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (url.startsWith("https://annbee.example.org/")) return new Response(CAMPAIGN, { status: 200, headers: { "content-type": "text/html" } });
      return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    });
    const deps = {
      db: fake.db,
      electionId: "e1",
      config: compareCfg,
      client: { messages: { parse } } as never,
      fetchImpl: fetchImpl as never,
      resolve: resolve as never,
      sleep: async () => {},
      compareKeys: [PKEY],
      now,
    };
    await dispatch({ ...deps, runRemote: async () => {} });
    const out = await runJob(deps, `${PKEY}@claude-haiku-5-5:low`);
    expect(out.outcome).toBe("compared");

    const [v] = fake.tables.synthesized_field_versions as { payload: Record<string, unknown>; status: string }[];
    expect(v.status).toBe("held");
    expect(v.payload).toMatchObject({
      kind: "person",
      v: 2,
      education: [{ degree: "Bachelor of Arts", field: "History", institution: "University of Michigan" }],
      positions: [
        { title: "Member", organization: "Springfield City Council", startYear: 2019, endYear: "present" },
        { title: "Teacher", startYear: 2005, endYear: 2018 },
      ],
      platform: [{ text: "Says she will expand bus service to every neighborhood." }],
      bio: [
        { text: "Ann Bee has served on the Springfield City Council since 2019.", facts: ["P0"] },
        { text: "She was a teacher from 2005 to 2018.", facts: ["P1"] },
      ],
    });
    const run = (fake.tables.synthesis_runs as { metadata: { rejected: { field: string; detail?: string }[]; leftOut: unknown[]; tried: { outcome: string }[] } }[])[0];
    expect(run.metadata.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ field: "education.1", detail: "institution not in quote" }), expect.objectContaining({ field: "bio.2", detail: "family background" })]));
    expect(run.metadata.leftOut).toEqual([{ fact: "Daughter of two nurses", reason: "family background" }]);
    expect(run.metadata.tried.some((t) => t.outcome === "read")).toBe(true);
    now = new Date(now.getTime() + 1);
  });
});
