/**
 * One-time national county sweep (owner, 2026-10-30): one test address per
 * county, about 3,143 lookups, to find every naming and display quirk in
 * the ballot data before writing normalization rules.
 *
 * Each address is built in memory from Census TIGER address ranges
 * (tiger.ts), looked up through the normal resolver path, and discarded.
 * qa_runs keeps only "ST · County", the status and the provider's wording,
 * exactly as the national test list does. Progress is the set of counties
 * already stored under SWEEP_RUN_ID, so each cron run picks up where the
 * last one stopped and the sweep ends by itself.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ElectionRef } from "@/domain/ballot";
import { electionToday } from "@/domain/electionDay";
import type { BallotRuntime } from "@/lib/ballot/runtime";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { lookupLocation, type QaInsert } from "./matrix";
import { ADDRFEAT_FIELDS, addrfeatUrl, countyAddresses, countyListUrl, isResidentialRoad, parseCountyList, readDbf, readZipEntry, type County } from "./tiger";

type Db = SupabaseClient<Database>;

/** Fixed, so every cron run adds to the same sweep. */
export const SWEEP_RUN_ID = "5ee9c0a7-1e5f-4c0b-9b3a-2026c0457e11";
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** The largest county files are tens of MB zipped. */
const MAX_ZIP_BYTES = 250_000_000;

export const countyLabel = (c: County) => `${c.state} · ${c.name} (${c.fips})`;

async function download(fetchImpl: typeof fetch, url: string): Promise<Uint8Array | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), headers: { "user-agent": "ballot.ai QA sweep (+https://ballot-ai.vercel.app)" } });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_ZIP_BYTES) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Look one county up: first road, then a second if the first has no ballot. */
async function sweepCounty(runtime: BallotRuntime, election: ElectionRef, county: County, fetchImpl: typeof fetch, today: string): Promise<QaInsert> {
  const label = countyLabel(county);
  let zip: Uint8Array | null = null;
  try {
    zip = await download(fetchImpl, addrfeatUrl(county.fips));
  } catch (e) {
    return { run_id: SWEEP_RUN_ID, label, state: county.state, status: "ERROR", error: `download: ${e instanceof Error ? e.name : "failed"}` };
  }
  const dbf = zip ? readZipEntry(zip, ".dbf") : null;
  const addresses = dbf ? countyAddresses(readDbf(dbf, ADDRFEAT_FIELDS, isResidentialRoad), county.state) : [];
  if (!addresses.length) return { run_id: SWEEP_RUN_ID, label, state: county.state, status: "ERROR", error: zip ? "no residential address ranges" : "download failed" };
  let row: QaInsert | undefined;
  for (const address of addresses) {
    row = await lookupLocation(runtime, election, SWEEP_RUN_ID, label, address, today);
    if (row.status !== "NO_COVERAGE" && row.status !== "INVALID_ADDRESS") break;
  }
  return { ...row!, state: row!.state ?? county.state };
}

export async function runCountySweep(opts: {
  db: Db;
  runtime: BallotRuntime;
  election: ElectionRef;
  fetchImpl?: typeof fetch;
  perRun?: number;
  budgetMs?: number;
  concurrency?: number;
}): Promise<{ done: number; total: number; stored: number; finished: boolean }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const until = Date.now() + (opts.budgetMs ?? 240_000);
  const listRes = await fetchImpl(countyListUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!listRes.ok) throw new Error(`county list: HTTP ${listRes.status}`);
  const counties = parseCountyList(await listRes.text());

  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await opts.db.from("qa_runs").select("label").eq("run_id", SWEEP_RUN_ID).range(from, from + 999);
    if (error) throw new Error(`qa_runs read: ${error.message}`);
    for (const r of data ?? []) done.add(r.label);
    if ((data ?? []).length < 1000) break;
  }
  const queue = counties.filter((c) => !done.has(countyLabel(c))).slice(0, opts.perRun ?? 40);
  const today = electionToday();
  const rows: QaInsert[] = [];
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? 1, queue.length) }, async () => {
      while (queue.length && Date.now() < until) rows.push(await sweepCounty(opts.runtime, opts.election, queue.shift()!, fetchImpl, today));
    }),
  );
  if (rows.length) {
    const { error } = await opts.db.from("qa_runs").insert(rows);
    if (error) throw new Error(`qa_runs insert: ${error.message}`);
  }
  const total = counties.length;
  const doneNow = done.size + rows.length;
  logEvent("qa.county_sweep", { stored: rows.length, done: doneNow, total });
  return { done: doneNow, total, stored: rows.length, finished: doneNow >= total };
}
