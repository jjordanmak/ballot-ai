/**
 * One-time check (owner, 2026-10-30) before building news from GDELT's
 * 15-minute data files (src/lib/feeds/gdeltFiles.ts). The first 4 runs
 * (2026-10-30) showed one file fits a cron run easily (about 4.5 MB, under
 * a second to read) but held almost nothing from our outlets. So this
 * replays the last 24 hours once: up to 96 archived files, oldest last,
 * counting how many articles come from our outlets and name a tracked
 * candidate, to decide whether a collector is worth building. One row in
 * qa_runs under GDELT_PROBE_RUN_ID, with counts and up to 10 public headlines.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GDELT_LASTUPDATE_URL, gkgFilesBefore, parseGkgRow, parseLastUpdate } from "@/lib/feeds/gdeltFiles";
import { loadTracked } from "@/lib/feeds/collect-news";
import { candidateQueries } from "@/lib/feeds/match";
import { safeFetch, type Resolver } from "@/lib/feeds/safeFetch";
import type { NewsSource } from "@/lib/feeds/sources";
import { logEvent } from "@/lib/observability/log";
import type { Database, Json } from "@/lib/supabase/types";
import { readZipEntry } from "./tiger";

type Db = SupabaseClient<Database>;

export const GDELT_PROBE_RUN_ID = "9d3e1f00-0000-4000-8000-2026103000b2";
export const REPLAY_LABEL = "GDELT · 24-hour replay";
const REPLAY_FILES = 96;
const MAX_ZIP_BYTES = 80_000_000;
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";

export interface GkgStats {
  rows: number;
  ourOutlets: number;
  byOutlet: Record<string, number>;
  namesTracked: number;
  ourOutletsNamingTracked: number;
  /** Outlets (any, vetted or not) whose articles named a tracked candidate, to see where coverage is. */
  trackedByDomain: Record<string, number>;
  sample: { domain: string; title: string; names: string[] }[];
}

export const emptyStats = (): GkgStats => ({ rows: 0, ourOutlets: 0, byOutlet: {}, namesTracked: 0, ourOutletsNamingTracked: 0, trackedByDomain: {}, sample: [] });

/** Counts over one GKG file's text, added to `stats`. Pure. */
export function gkgStats(text: string, domains: string[], names: string[], stats: GkgStats = emptyStats()): GkgStats {
  const ours = new Set(domains.map((d) => d.toLowerCase()));
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const line of text.split("\n")) {
    const row = parseGkgRow(line);
    if (!row) continue;
    stats.rows++;
    const outlet = [...ours].find((d) => row.domain === d || row.domain.endsWith(`.${d}`));
    const hits = row.persons.filter((p) => wanted.has(p));
    if (outlet) {
      stats.ourOutlets++;
      stats.byOutlet[outlet] = (stats.byOutlet[outlet] ?? 0) + 1;
    }
    if (hits.length) {
      stats.namesTracked++;
      stats.trackedByDomain[row.domain] = (stats.trackedByDomain[row.domain] ?? 0) + 1;
    }
    if (outlet && hits.length) {
      stats.ourOutletsNamingTracked++;
      if (stats.sample.length < 10) stats.sample.push({ domain: row.domain, title: row.title.slice(0, 200), names: hits });
    }
  }
  return stats;
}

const top = (counts: Record<string, number>, n: number) => Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n));

export async function runGdeltProbe(opts: {
  db: Db;
  electionId: string;
  sources: NewsSource[];
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  budgetMs?: number;
}): Promise<{ stored: boolean; files?: number }> {
  const { db } = opts;
  const { data: done } = await db.from("qa_runs").select("id").eq("run_id", GDELT_PROBE_RUN_ID).eq("label", REPLAY_LABEL).limit(1);
  if (done?.length) return { stored: false };

  const started = Date.now();
  const until = started + (opts.budgetMs ?? 240_000);
  const deps = { fetchImpl: opts.fetchImpl, resolve: opts.resolve };
  const last = await safeFetch(GDELT_LASTUPDATE_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) }, deps);
  const newest = last.ok && last.text ? parseLastUpdate(last.text) : null;
  const base = { run_id: GDELT_PROBE_RUN_ID, label: REPLAY_LABEL };

  let row: Database["public"]["Tables"]["qa_runs"]["Insert"];
  if (!newest) {
    row = { ...base, status: "ERROR", error: `lastupdate: HTTP ${last.status}` };
  } else {
    const domains = opts.sources.filter((s) => s.gdeltDomain).map((s) => s.gdeltDomain!);
    const names = candidateQueries(await loadTracked(db, opts.electionId)).map((q) => q.name);
    const stats = emptyStats();
    // The newest file is sometimes listed before it can be downloaded: start from the one before it.
    const files = gkgFilesBefore(newest.url, REPLAY_FILES);
    let read = 0;
    let missing = 0;
    let bytes = 0;
    for (const url of files) {
      if (Date.now() > until) break;
      const zip = await safeFetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000), maxBytes: MAX_ZIP_BYTES }, deps).catch(() => null);
      const csv = zip?.ok && zip.bytes && !zip.truncated ? readZipEntry(zip.bytes, ".csv") : null;
      if (!csv) {
        missing++;
        continue;
      }
      read++;
      bytes += zip!.bytes!.byteLength;
      gkgStats(new TextDecoder().decode(csv), domains, names, stats);
    }
    row = {
      ...base,
      status: "PROBE",
      contest_count: stats.ourOutletsNamingTracked,
      inventory: {
        filesAsked: files.length,
        filesRead: read,
        filesMissing: missing,
        from: files[Math.max(0, read + missing - 1)]?.split("/").pop(),
        to: files[0]?.split("/").pop(),
        zipMb: Math.round(bytes / 1e5) / 10,
        seconds: Math.round((Date.now() - started) / 1000),
        rssMb: Math.round(process.memoryUsage().rss / 1e6),
        outlets: domains.length,
        trackedNames: names.length,
        ...stats,
        trackedByDomain: top(stats.trackedByDomain, 25),
      } as unknown as Json,
    };
  }
  const { error } = await db.from("qa_runs").insert(row);
  if (error) throw new Error(`qa_runs insert: ${error.message}`);
  logEvent("qa.gdelt_probe", { label: REPLAY_LABEL, status: row.status, ms: Date.now() - started });
  return { stored: true, files: (row.inventory as { filesRead?: number } | undefined)?.filesRead };
}
