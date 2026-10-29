/**
 * Run provider-agnostic validators over every committed normalized ballot
 * fixture (and the fictional Civic sample, through the real normalizer).
 * Writes reports/validation/latest.{json,md}; exits 1 on any error-severity
 * finding. Used in CI. See docs/elections/2026-11-03/QA_PLAN.md.
 *
 *   npm run validate:ballots
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BallotWarning, ResolvedBallot } from "../src/domain/ballot";
import { validateBallot } from "../src/lib/ballot/validate";
import { FixtureBallotResolver } from "../src/lib/providers/fixture";
import { AddressInput } from "../src/lib/providers/address";
import { FIXTURE_ELECTION } from "../src/lib/ballot/fixtureElection";
import { electionToday } from "../src/domain/electionDay";

function walk(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".normalized.json") ? [p] : [];
    });
  } catch {
    return [];
  }
}

async function main() {
  const today = process.env.VALIDATE_TODAY ?? electionToday();
  const inputs: { name: string; ballot: ResolvedBallot }[] = [];

  const sample = await new FixtureBallotResolver(() => new Date(`${FIXTURE_ELECTION.date}T00:00:00Z`)).resolveBallot(
    AddressInput.parse("fictional sample")!,
    FIXTURE_ELECTION,
  );
  inputs.push({ name: "fixture:sample-voterinfo (fictional)", ballot: sample });
  for (const f of walk("fixtures/ballots")) inputs.push({ name: f, ballot: JSON.parse(readFileSync(f, "utf8")) });

  const results = inputs.map(({ name, ballot }) => {
    // Election-day staleness is expected for historical fixtures; validate as of the election.
    const asOf = ballot.election && ballot.election.date < today ? ballot.election.date : today;
    const findings: BallotWarning[] = [...ballot.warnings, ...validateBallot(ballot, asOf)];
    return { name, status: ballot.status, contests: ballot.contests.length, findings };
  });

  const errors = results.flatMap((r) => r.findings.filter((f) => f.severity === "error").map((f) => ({ file: r.name, ...f })));
  mkdirSync("reports/validation", { recursive: true });
  writeFileSync("reports/validation/latest.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n");
  const md = [
    "# Ballot validation",
    "",
    "| Ballot | Status | Contests | Errors | Warnings | Info |",
    "|---|---|---|---|---|---|",
    ...results.map((r) => {
      const n = (s: string) => r.findings.filter((f) => f.severity === s).length;
      return `| ${r.name} | ${r.status} | ${r.contests} | ${n("error")} | ${n("warn")} | ${n("info")} |`;
    }),
    "",
    errors.length ? `**${errors.length} error(s)** — see latest.json` : "No error-severity findings.",
    "",
  ].join("\n");
  writeFileSync("reports/validation/latest.md", md);
  console.log(md);
  process.exit(errors.length ? 1 : 0);
}

main();
