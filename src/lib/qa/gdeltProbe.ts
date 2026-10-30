/**
 * One-time check (owner, 2026-10-30) before building news from GDELT's
 * 15-minute data files (src/lib/feeds/gdeltFiles.ts): from production, how
 * big is one GKG file, how long it takes to download, unzip and read, and
 * how many of its articles are from our outlets and name a tracked
 * candidate. Runs PROBE_RUNS times, one file each; rows go to qa_runs
 * under GDELT_PROBE_RUN_ID with counts and up to 10 public headlines.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GDELT_LASTUPDATE_URL, parseGkgRow, parseLastUpdate } from "@/lib/feeds/gdeltFiles";
import { loadTracked } from "@/lib/feeds/collect-news";
import { candidateQueries } from "@/lib/feeds/match";
import { safeFetch, type Resolver } from "@/lib/feeds/safeFetch";
import type { NewsSource } from "@/lib/feeds/sources";
import { logEvent } from "@/lib/observability/log";
import type { Database, Json } from "@/lib/supabase/types";
import { readZipEntry } from "./tiger";

type Db = SupabaseClient<Database>;

export const GDELT_PROBE_RUN_ID = "9d3e1f00-0000-4000-8000-2026103000b2";
const PROBE_RUNS = 4;
const MAX_ZIP_BYTES = 80_000_000;
const USER_AGENT = "ballot.ai news collector (+https://ballot-ai.vercel.app)";

export interface GkgStats {
  rows: number;
  ourOutlets: number;
  byOutlet: Record<string, number>;
  namesTracked: number;
  ourOutletsNamingTracked: number;
  sample: { domain: string; title: string; names: string[] }[];
}

/** Counts over one GKG file's text. Pure. */
export function gkgStats(text: string, domains: string[], names: string[]): GkgStats {
  const ours = new Set(domains.map((d) => d.toLowerCase()));
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const stats: GkgStats = { rows: 0, ourOutlets: 0, byOutlet: {}, namesTracked: 0, ourOutletsNamingTracked: 0, sample: [] };
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
    if (hits.length) stats.namesTracked++;
    if (outlet && hits.length) {
      stats.ourOutletsNamingTracked++;
      if (stats.sample.length < 10) stats.sample.push({ domain: row.domain, title: row.title.slice(0, 200), names: hits });
    }
  }
  return stats;
}

export async function runGdeltProbe(opts: { db: Db; electionId: string; sources: NewsSource[]; fetchImpl?: typeof fetch; resolve?: Resolver }): Promise<{ stored: boolean; done: number }> {
  const { db } = opts;
  const { count } = await db.from("qa_runs").select("id", { count: "exact", head: true }).eq("run_id", GDELT_PROBE_RUN_ID);
  if ((count ?? 0) >= PROBE_RUNS) return { stored: false, done: count ?? 0 };

  const t0 = Date.now();
  const last = await safeFetch(GDELT_LASTUPDATE_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) }, { fetchImpl: opts.fetchImpl, resolve: opts.resolve });
  const file = last.ok && last.text ? parseLastUpdate(last.text) : null;
  const tLast = Date.now() - t0;
  const label = `GDELT · ${file?.url.split("/").pop() ?? new Date().toISOString()}`;
  const base = { run_id: GDELT_PROBE_RUN_ID, label, status: "PROBE" };

  let row: Database["public"]["Tables"]["qa_runs"]["Insert"];
  if (!file) {
    row = { ...base, status: "ERROR", error: `lastupdate: HTTP ${last.status}` };
  } else {
    const t1 = Date.now();
    const zip = await safeFetch(file.url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(120_000), maxBytes: MAX_ZIP_BYTES }, { fetchImpl: opts.fetchImpl, resolve: opts.resolve });
    const tDownload = Date.now() - t1;
    if (!zip.ok || !zip.bytes || zip.truncated) {
      row = { ...base, status: "ERROR", error: `gkg: HTTP ${zip.status}${zip.truncated ? " truncated" : ""}`, inventory: { advertised: file.size, tLast, tDownload } as Json };
    } else {
      const t2 = Date.now();
      const csv = readZipEntry(zip.bytes, ".csv");
      const tUnzip = Date.now() - t2;
      const t3 = Date.now();
      const text = csv ? new TextDecoder().decode(csv) : "";
      const domains = opts.sources.filter((s) => s.gdeltDomain).map((s) => s.gdeltDomain!);
      const names = candidateQueries(await loadTracked(db, opts.electionId)).map((q) => q.name);
      const stats = gkgStats(text, domains, names);
      const tParse = Date.now() - t3;
      row = {
        ...base,
        contest_count: stats.ourOutletsNamingTracked,
        inventory: {
          advertised: file.size,
          zipBytes: zip.bytes.byteLength,
          csvBytes: csv?.byteLength ?? 0,
          ms: { lastupdate: tLast, download: tDownload, unzip: tUnzip, parse: tParse },
          rssMb: Math.round(process.memoryUsage().rss / 1e6),
          outlets: domains.length,
          trackedNames: names.length,
          ...stats,
        } as unknown as Json,
      };
    }
  }
  const { error } = await db.from("qa_runs").insert(row);
  if (error) throw new Error(`qa_runs insert: ${error.message}`);
  logEvent("qa.gdelt_probe", { label, status: row.status, ms: Date.now() - t0 });
  return { stored: true, done: (count ?? 0) + 1 };
}
