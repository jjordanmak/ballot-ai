/**
 * One-time diagnosis (owner, 2026-10-30): why most counties come back from
 * Google with the right state but no races. Google's docs say same-day
 * elections return no contests unless the request names the election, and
 * Google lists elections per state; we send one national election id for
 * every address. For one county per state this records, address-free:
 * Google's same-day election list, and the contest count from the national
 * id (with and without returnAllAvailableData), from no id at all (with
 * the election Google picks and its otherElections), and from each of the
 * state's own same-day ids. Rows go to qa_runs under PROBE_RUN_ID.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ElectionRef } from "@/domain/ballot";
import { logEvent } from "@/lib/observability/log";
import { AddressInput } from "@/lib/providers/address";
import { GoogleCivicClient } from "@/lib/providers/google-civic/client";
import { normalizeVoterInfo } from "@/lib/providers/google-civic/normalize";
import type { CivicElection } from "@/lib/providers/google-civic/types";
import type { Database, Json } from "@/lib/supabase/types";
import { countyTestAddresses, fetchCounties } from "./countySweep";
import { completeRow, type QaInsert } from "./matrix";
import type { County } from "./tiger";

type Db = SupabaseClient<Database>;

export const PROBE_RUN_ID = "c1d1c0de-0000-4000-8000-2026103000a1";
const ELECTIONS_LABEL = "PROBE · elections";

export interface ProbeCall {
  /** Which request: "national", "national-no-alldata", "no-id", or "state:<id>". */
  call: string;
  ok: boolean;
  failure?: string;
  /** Contests Google returned, and how many survived our normalizer. */
  raw: number;
  normalized: number;
  election?: { id?: string; name?: string };
  otherElections?: { id?: string; name?: string; ocd?: string }[];
  state?: string;
}

/** Same-day elections whose division is this state (e.g. "ocd-division/country:us/state:al"). */
export function stateElections(sameDay: CivicElection[], state: string): CivicElection[] {
  const ocd = `ocd-division/country:us/state:${state.toLowerCase()}`;
  return sameDay.filter((e) => e.id && (e.ocdDivisionId === ocd || e.ocdDivisionId?.startsWith(`${ocd}/`)));
}

/** The first county of each state, in the Census list's order. */
export function onePerState(counties: County[]): County[] {
  const seen = new Set<string>();
  return counties.filter((c) => (seen.has(c.state) ? false : (seen.add(c.state), true)));
}

async function probeState(client: GoogleCivicClient, election: ElectionRef, national: string, sameDay: CivicElection[], county: County, fetchImpl: typeof fetch): Promise<QaInsert> {
  const label = `PROBE · ${county.state}`;
  const { addresses, error } = await countyTestAddresses(county, fetchImpl);
  const address = addresses[0] ? AddressInput.parse(addresses[0]) : null;
  if (!address) return { run_id: PROBE_RUN_ID, label, state: county.state, status: "ERROR", error: error ?? "no address" };

  const requests: { call: string; electionId?: string; allData: boolean }[] = [
    { call: "national", electionId: national, allData: true },
    { call: "national-no-alldata", electionId: national, allData: false },
    { call: "no-id", allData: false },
    ...stateElections(sameDay, county.state).map((e) => ({ call: `state:${e.id}`, electionId: e.id, allData: true })),
  ];
  const calls: ProbeCall[] = [];
  for (const r of requests) {
    const res = await client.voterInfoWith(address, { electionId: r.electionId, allData: r.allData });
    if (!res.ok) {
      calls.push({ call: r.call, ok: false, failure: res.failure, raw: 0, normalized: 0 });
      continue;
    }
    const body = res.body;
    calls.push({
      call: r.call,
      ok: true,
      raw: body.contests?.length ?? 0,
      normalized: normalizeVoterInfo(body, election, new Date().toISOString()).contests.length,
      election: { id: body.election?.id, name: body.election?.name },
      otherElections: (body.otherElections ?? []).map((e) => ({ id: e.id, name: e.name, ocd: e.ocdDivisionId })),
      state: body.normalizedInput?.state,
    });
  }
  const best = Math.max(...calls.map((c) => c.normalized));
  return {
    run_id: PROBE_RUN_ID,
    label,
    state: county.state,
    status: "PROBE",
    contest_count: best,
    // County name and per-call counts only: never the address.
    inventory: { county: county.name, calls } as unknown as Json,
  };
}

export async function runCivicProbe(opts: {
  db: Db;
  election: ElectionRef;
  client?: GoogleCivicClient;
  fetchImpl?: typeof fetch;
  perRun?: number;
  budgetMs?: number;
}): Promise<{ done: number; total: number; stored: number }> {
  const client = opts.client ?? new GoogleCivicClient();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const until = Date.now() + (opts.budgetMs ?? 240_000);
  const national = opts.election.externalIds["google-civic"];
  if (!national) throw new Error("no google-civic election id");

  const list = await client.elections();
  if (!list.ok) throw new Error(`civic /elections: ${list.failure}`);
  const sameDay = (list.body.elections ?? []).filter((e) => e.electionDay === opts.election.date);

  const { data, error } = await opts.db.from("qa_runs").select("label").eq("run_id", PROBE_RUN_ID).range(0, 999);
  if (error) throw new Error(`qa_runs read: ${error.message}`);
  const done = new Set((data ?? []).map((r) => r.label));

  const rows: QaInsert[] = [];
  if (!done.has(ELECTIONS_LABEL)) {
    rows.push({
      run_id: PROBE_RUN_ID,
      label: ELECTIONS_LABEL,
      status: "PROBE",
      contest_count: sameDay.length,
      inventory: { national, sameDay: sameDay.map((e) => ({ id: e.id, name: e.name, ocd: e.ocdDivisionId })), all: (list.body.elections ?? []).length } as unknown as Json,
    });
  }
  const states = onePerState(await fetchCounties(fetchImpl));
  const queue = states.filter((c) => !done.has(`PROBE · ${c.state}`)).slice(0, opts.perRun ?? 12);
  for (const county of queue) {
    if (Date.now() > until) break;
    rows.push(await probeState(client, opts.election, national, sameDay, county, fetchImpl));
  }
  if (rows.length) {
    const { error: insertError } = await opts.db.from("qa_runs").insert(rows.map(completeRow));
    if (insertError) throw new Error(`qa_runs insert: ${insertError.message}`);
  }
  const stateRows = rows.filter((r) => r.label !== ELECTIONS_LABEL).length;
  const doneStates = [...done].filter((l) => l !== ELECTIONS_LABEL).length + stateRows;
  logEvent("qa.civic_probe", { stored: rows.length, done: doneStates, total: states.length, sameDay: sameDay.length });
  return { done: doneStates, total: states.length, stored: rows.length };
}
