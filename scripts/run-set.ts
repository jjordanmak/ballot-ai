/**
 * Write a writing-round run set (src/data/research/run-sets/<name>.json)
 * from an export of one stored ballot's contests, by durable ids only.
 *
 *   npx tsx scripts/run-set.ts <export.json> <name> "<ballot label>"
 *
 * The export is a JSON array of { durableId, kind, contestType, title,
 * choices: [{ durableId, name }] } (e.g. ballot_resolutions.ballot->'contests'
 * joined to contest_candidates names in the Supabase SQL editor). Never put
 * the address in the label: name the ballot by city and ZIP, e.g.
 * "Placentia (92870) sample ballot".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runSetFor, type RunSetContest } from "../src/lib/research/runSet";

const [file, name, label] = process.argv.slice(2);
if (!file || !name || !label || !/^[a-z0-9-]+$/.test(name)) {
  console.error('usage: tsx scripts/run-set.ts <export.json> <name> "<ballot label>"');
  process.exit(1);
}
const contests = JSON.parse(readFileSync(file, "utf8")) as RunSetContest[];
const set = runSetFor(label, contests);
const out = `src/data/research/run-sets/${name}.json`;
const about = `Writing round run set (WRITING_PIPELINE_PLAN.md): every race intro, candidate, judge and measure on the ${label}, by durable ids only (contest and candidate ids); no address. Rebuild with scripts/run-set.ts.`;
writeFileSync(out, JSON.stringify({ _about: about, ...set }, null, 2) + "\n");
console.log(`wrote ${out}: ${set.targets.length} items`);
