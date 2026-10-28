/**
 * Live QA resolution for a PRIVATE address held in an environment variable.
 *
 *   npm run qa:resolve -- --env BALLOT_QA_ADDRESS_94015 --label daly-city
 *
 * Writes (address-free):
 *   fixtures/ballots/2026-11-03/<label>.normalized.json   regression fixture
 *   reports/2026-11-03/<label>-qa.json / <label>-qa.md     QA report skeleton
 *
 * The address is read from the env var only, passed to Google Civic once,
 * and never written, logged, or printed. Outputs are scanned for it before
 * anything is saved. See docs/architecture/PRIVACY.md §8.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { ElectionRef } from "../src/domain/ballot";
import { validateBallot } from "../src/lib/ballot/validate";
import { supplementWithOfficialRecords } from "../src/lib/ballot/officialRecords";
import { AddressInput } from "../src/lib/providers/address";
import {
  GoogleCivicBallotResolver,
  GoogleCivicElectionProvider,
  matchProviderElection,
} from "../src/lib/providers/google-civic/resolver";
import { ballotMarkdown } from "./lib/report";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

/** Tokens of the address that must never appear in outputs. */
function sensitiveTokens(raw: string): string[] {
  const street = raw.split(",")[0].trim();
  const tokens = [raw.trim(), street];
  const m = /^(\d+)\s+(.+)$/.exec(street);
  if (m) tokens.push(`${m[1]} ${m[2].split(/\s+/)[0]}`);
  return tokens.filter((t) => t.length >= 4).map((t) => t.toLowerCase());
}

async function main() {
  const envName = arg("env");
  const label = arg("label");
  const date = arg("date", "2026-11-03");
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("--label must be lowercase letters, digits, hyphens");

  const address = AddressInput.parse(process.env[envName]);
  if (!address) throw new Error(`env ${envName} is unset or not an address`);
  if (!process.env.GOOGLE_CIVIC_API_KEY) throw new Error("GOOGLE_CIVIC_API_KEY is not set");

  const elections = await new GoogleCivicElectionProvider().getElections();
  if (!elections.ok) throw new Error(`Civic /elections failed: ${elections.kind} ${elections.detail}`);
  console.log(`Civic elections on ${date}:`, elections.value.filter((e) => e.date === date).map((e) => `${e.externalId} ${e.name} [${e.ocdDivisionId}]`));
  const match = matchProviderElection(elections.value, date, process.env.GOOGLE_CIVIC_ELECTION_ID || undefined);
  if (!match) throw new Error(`no Civic election matches ${date}`);

  const election: ElectionRef = {
    id: `us-${date}-general`,
    slug: date,
    name: match.name || `${date} election`,
    date,
    externalIds: { "google-civic": match.externalId },
  };

  const ballot = await new GoogleCivicBallotResolver().resolveBallot(address, election);
  supplementWithOfficialRecords(ballot);
  ballot.warnings.push(...validateBallot(ballot, new Date().toISOString().slice(0, 10)));

  const fixtureJson = JSON.stringify(ballot, null, 2) + "\n";
  const md = ballotMarkdown(`QA: ${label} — ${election.name}`, ballot, [
    `- **Civic election id discovered:** ${match.externalId} ("${match.name}")`,
    "- **Verification:** every row starts **unverified**; compare against the county sample ballot for the same address, the CA SoS voter guide, and city sources, then record results in the verification column.",
  ]);
  const reportJson = JSON.stringify({ label, generatedAt: new Date().toISOString(), election, ballot }, null, 2) + "\n";

  const lowered = (fixtureJson + md + reportJson).toLowerCase();
  const leaked = sensitiveTokens(address.reveal()).some((t) => lowered.includes(t));
  if (leaked) throw new Error("REFUSING TO WRITE: output contains part of the private address");

  mkdirSync(`fixtures/ballots/${date}`, { recursive: true });
  mkdirSync(`reports/${date}`, { recursive: true });
  writeFileSync(`fixtures/ballots/${date}/${label}.normalized.json`, fixtureJson);
  writeFileSync(`reports/${date}/${label}-qa.json`, reportJson);
  writeFileSync(`reports/${date}/${label}-qa.md`, md);
  console.log(`status=${ballot.status} contests=${ballot.contests.length} warnings=${ballot.warnings.length}`);
  console.log(`wrote fixtures/ballots/${date}/${label}.normalized.json, reports/${date}/${label}-qa.{json,md}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
