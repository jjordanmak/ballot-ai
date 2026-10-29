/**
 * Freeze the deprecated June 2, 2026 CA primary prototype into a committed
 * snapshot (src/data/deprecated/2026-06-02-ca-primary.json), in exactly the
 * shape its pages render. The pages never read the database, so later schema
 * or content changes can't break them.
 *
 *   npx tsx scripts/snapshot-deprecated.ts <june-export.json>
 *
 * The export is one JSON object of the June rows: { election, jurisdictions,
 * races, candidates, endorsements, news } (e.g. a json_agg per table from
 * the Supabase SQL editor). It holds no residential addresses.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildBallot, type JuneRows } from "./lib/deprecatedBallot";

const OUT = "src/data/deprecated/2026-06-02-ca-primary.json";

interface Export extends JuneRows {
  election: { id: string; name: string; date: string; state: string };
  jurisdictions: { zip: string; city: string | null; county: string | null; state: string; districts: Record<string, string | number | undefined> }[];
}

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/snapshot-deprecated.ts <june-export.json>");
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, "utf8")) as Export;
const ballots = Object.fromEntries(
  rows.jurisdictions.flatMap((j) => {
    const races = buildBallot(rows, j.districts ?? {});
    return races.length ? [[j.zip, { jurisdiction: { zip: j.zip, city: j.city, county: j.county, state: j.state, districts: j.districts ?? {} }, races }]] : [];
  }),
);
const { id, name, date, state } = rows.election;
writeFileSync(OUT, JSON.stringify({ frozen: true, election: { id, name, date: date.slice(0, 10), state }, ballots }, null, 2) + "\n");
console.log(`wrote ${OUT}: ${Object.keys(ballots).length} ZIP(s), ${Object.values(ballots).map((b) => (b as { races: unknown[] }).races.length).join(", ")} races`);
