/**
 * National test list (owner, 2026-10-30): look up a fixed set of public
 * civic buildings across the country and record what the ballot provider
 * returned, so race titles, district names, candidate names and party
 * labels can be checked for consistency in every state. The list lives in
 * the private env var QA_CIVIC_BUILDINGS ([{ "label", "address" }]); the
 * addresses never leave this module except to the ballot provider, and
 * nothing here saves a ballot or registers contests. AI content is not
 * checked.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasBallot, type ElectionRef, type ResolvedBallot } from "@/domain/ballot";
import { electionToday } from "@/domain/electionDay";
import { supplementWithOfficialRecords } from "@/lib/ballot/officialRecords";
import type { BallotRuntime } from "@/lib/ballot/runtime";
import { validateBallot } from "@/lib/ballot/validate";
import { logEvent } from "@/lib/observability/log";
import { AddressInput } from "@/lib/providers/address";
import type { Database, Json } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;
export type QaInsert = Database["public"]["Tables"]["qa_runs"]["Insert"];

export interface QaLocation {
  /** "WA · Seattle City Hall": state first, never the street. */
  label: string;
  address: string;
}

/** Parse the env var; entries without a label or address are dropped. */
export function parseLocations(raw: string | undefined): QaLocation[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((x) =>
      x && typeof x === "object" && typeof (x as QaLocation).label === "string" && typeof (x as QaLocation).address === "string"
        ? [{ label: (x as QaLocation).label, address: (x as QaLocation).address }]
        : [],
    );
  } catch {
    return [];
  }
}

/** What a run keeps about one ballot: counts, warnings, and the provider's own wording. */
export function summarize(ballot: ResolvedBallot): Pick<QaInsert, "status" | "state" | "contest_count" | "categories" | "warnings" | "inventory"> {
  const categories: Record<string, number> = {};
  for (const c of ballot.contests) categories[c.category] = (categories[c.category] ?? 0) + 1;
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && x.trim().length > 0))];
  return {
    status: ballot.status,
    state: ballot.location.state ?? null,
    contest_count: ballot.contests.length,
    categories: categories as Json,
    warnings: ballot.warnings.map((w) => ({ code: w.code, severity: w.severity, detail: w.detail ?? null })) as Json,
    inventory: {
      titles: uniq(ballot.contests.map((c) => c.title)),
      ballotTitles: uniq(ballot.contests.map((c) => c.ballotTitle)),
      divisions: uniq(ballot.contests.map((c) => c.division.name)),
      contestTypes: uniq(ballot.contests.map((c) => `${c.kind}:${c.contestType}:${c.category}`)),
      candidates: uniq(ballot.contests.flatMap((c) => c.choices.map((ch) => ch.ballotName))),
      parties: uniq(ballot.contests.flatMap((c) => c.choices.map((ch) => ch.party))),
      measures: uniq(ballot.contests.map((c) => c.measure?.identifier ?? (c.kind === "measure" ? c.title : undefined))),
    } as Json,
  };
}

/** Look one location up through the normal resolver path; the address is used here and nowhere else. */
export async function lookupLocation(runtime: BallotRuntime, election: ElectionRef, runId: string, label: string, raw: string, today = electionToday()): Promise<QaInsert> {
  const address = AddressInput.parse(raw);
  if (!address) return { run_id: runId, label, status: "INVALID_ADDRESS", error: "unparseable address" };
  try {
    const ballot = await runtime.resolver.resolveBallot(address, election);
    if (hasBallot(ballot)) {
      supplementWithOfficialRecords(ballot);
      ballot.warnings.push(...validateBallot(ballot, today));
    }
    return { run_id: runId, label, ...summarize(ballot) };
  } catch (e) {
    return { run_id: runId, label, status: "ERROR", error: e instanceof Error ? e.name : "unknown" };
  }
}

/** Look every location up once and store the results; returns how many were stored. */
export async function runMatrix(opts: {
  db: Db;
  runtime: BallotRuntime;
  election: ElectionRef;
  locations: QaLocation[];
  budgetMs?: number;
  concurrency?: number;
}): Promise<{ runId: string; stored: number; skipped: number }> {
  const runId = randomUUID();
  const until = Date.now() + (opts.budgetMs ?? 240_000);
  const queue = [...opts.locations];
  const rows: QaInsert[] = [];
  const today = electionToday();
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? 4, queue.length) }, async () => {
      while (queue.length && Date.now() < until) {
        const loc = queue.shift()!;
        rows.push(await lookupLocation(opts.runtime, opts.election, runId, loc.label, loc.address, today));
      }
    }),
  );
  if (rows.length) {
    const { error } = await opts.db.from("qa_runs").insert(rows);
    if (error) throw new Error(`qa_runs insert: ${error.message}`);
  }
  logEvent("qa.matrix", { runId, stored: rows.length, skipped: queue.length });
  return { runId, stored: rows.length, skipped: queue.length };
}
