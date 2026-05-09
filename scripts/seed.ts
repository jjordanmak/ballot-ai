/**
 * Seed Supabase from the existing TypeScript data files.
 *
 * Usage:
 *   npx tsx scripts/seed.ts            # seeds everything
 *   npx tsx scripts/seed.ts --governor # governor only
 *   npx tsx scripts/seed.ts --reset    # truncate first, then seed
 *
 * Reads:  src/data/governor.ts, src/data/scaffolds.ts, src/data/countyRaces.ts
 * Writes: elections, jurisdictions, races, candidates, endorsements, news_items
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

import { governor } from "../src/data/governor";
import * as scaffolds from "../src/data/scaffolds";
import * as countyRaces from "../src/data/countyRaces";
import type { Race, Candidate } from "../src/data/types";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to .env.local.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const GOVERNOR_ONLY = args.has("--governor");

// ─── Static reference data ────────────────────────────────────────
const ELECTION = {
  id: "ca-2026-primary",
  state: "CA",
  date: "2026-06-02",
  name: "Statewide Direct Primary Election",
  type: "primary",
};

// Demo: just the one ZIP we're starting with. Real ingestion pipeline
// will populate this table from the US Census Bureau geocoder.
const JURISDICTION_94015 = {
  zip: "94015",
  city: "Daly City",
  county: "San Mateo",
  state: "CA",
  districts: {
    state: "CA",
    county: "San Mateo",
    us_house: 15,
    state_assembly: 19,
    state_senate: 13,
    boe: 2,
    supervisor: 5,
    city: "Daly City",
  },
};

// race id → scope mapping
const SCOPE: Record<string, { type: "statewide" | "district" | "county"; value: string | null }> = {
  governor:                 { type: "statewide", value: null },
  "lt-governor":            { type: "statewide", value: null },
  "secretary-of-state":     { type: "statewide", value: null },
  controller:               { type: "statewide", value: null },
  treasurer:                { type: "statewide", value: null },
  "attorney-general":       { type: "statewide", value: null },
  "insurance-commissioner": { type: "statewide", value: null },
  "sup-public-instruction": { type: "statewide", value: null },
  "boe-d2":                 { type: "district",  value: "BOE-2" },
  "ca-15":                  { type: "district",  value: "CA-15" },
  "ad-19":                  { type: "district",  value: "AD-19" },
  "judge-office-4":         { type: "county",    value: "SMC" },
  "county-sup-schools":     { type: "county",    value: "SMC" },
  acre:                     { type: "county",    value: "SMC" },
  "county-controller":      { type: "county",    value: "SMC" },
  coroner:                  { type: "county",    value: "SMC" },
  "treasurer-tax-collector":{ type: "county",    value: "SMC" },
};

// ─── Helpers ──────────────────────────────────────────────────────
function raceRow(race: Race, idx: number) {
  const scope = SCOPE[race.id] ?? { type: "statewide" as const, value: null };
  return {
    id: race.id,
    election_id: ELECTION.id,
    office: race.office,
    jurisdiction_label: race.jurisdiction,
    format: race.format,
    format_explainer: race.formatExplainer,
    scope_type: scope.type,
    scope_value: scope.value,
    unopposed: race.unopposed,
    meta: race.meta,
    intro: race.intro,
    issues: race.issues,
    sort_order: idx,
  };
}

function candidateRow(c: Candidate, raceId: string, idx: number) {
  return {
    id: `${raceId}__${c.id}`,                // namespaced — many "TBD" placeholders share id across races
    race_id: raceId,
    name: c.name,
    party: c.party,
    headshot_url: c.headshot ?? null,
    major: c.major,
    polling_status: c.pollingStatus,
    polling_pct: c.pollingPct ?? null,
    trend: c.trend ?? null,
    campaign_suspended: c.campaignSuspended ?? null,
    withdrawn: c.withdrawn ?? false,
    current_position: c.currentRole,                  // DB column is `current_position` (current_role is a Postgres reserved word)
    past_roles: c.pastRoles,
    background: c.background,
    priorities: c.priorities,
    stances: c.stances,
    strengths: c.strengths,
    criticisms: c.criticisms,
    history: c.history,
    vote_for_if: c.voteForIf,
    bottom_line: c.bottomLine,
    issues: c.issues,
    sort_order: idx,
  };
}

function endorsementRows(c: Candidate, candidateDbId: string) {
  return c.endorsements.map((e, i) => ({
    candidate_id: candidateDbId,
    category: e.category,
    name: e.name,
    sort_order: i,
  }));
}

function newsRow(item: NonNullable<Race["news"]>[number], raceId: string | null, candidateId: string | null) {
  return {
    id: candidateId ? `${candidateId}__${item.id}` : `${raceId}__${item.id}`,
    race_id: raceId,
    candidate_id: candidateId,
    type: item.type,
    source: item.source,
    title: item.title,
    excerpt: item.excerpt ?? null,
    url: item.url ?? null,
    published_at: item.date,                    // ISO format expected; "May 6, 2026" will be coerced by Postgres
    social: item.social ?? null,
  };
}

// ─── Seed ─────────────────────────────────────────────────────────
async function main() {
  console.log("→ Seeding Ballot.ai (Supabase)");
  console.log(`  URL: ${url}`);
  console.log(`  Mode: ${GOVERNOR_ONLY ? "governor only" : "all races"}${RESET ? " (RESET)" : ""}`);

  if (RESET) {
    console.log("→ Truncating existing data");
    // Order matters — children first
    await sb.from("polls").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await sb.from("news_items").delete().neq("id", "");
    await sb.from("endorsements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await sb.from("candidates").delete().neq("id", "");
    await sb.from("races").delete().neq("id", "");
    await sb.from("jurisdictions").delete().neq("zip", "");
    await sb.from("elections").delete().neq("id", "");
  }

  // ── Election + jurisdiction ──
  await upsert("elections", [ELECTION], "id");
  await upsert("jurisdictions", [JURISDICTION_94015], "zip");

  // ── Races ──
  const allRaces: Race[] = GOVERNOR_ONLY
    ? [governor]
    : [
        governor,
        scaffolds.ltGovernor,
        scaffolds.secOfState,
        scaffolds.controller,
        scaffolds.treasurer,
        scaffolds.attorneyGeneral,
        scaffolds.insuranceCommissioner,
        scaffolds.supPublicInstruction,
        scaffolds.boe2,
        scaffolds.ca15,
        scaffolds.ad19,
        countyRaces.judgeOffice4,
        countyRaces.countySupSchools,
        countyRaces.acre,
        countyRaces.countyController,
        countyRaces.coroner,
        countyRaces.treasurerTaxCollector,
      ];

  await upsert("races", allRaces.map((r, i) => raceRow(r, i)), "id");
  console.log(`  ✓ ${allRaces.length} races`);

  // ── Candidates + endorsements + news ──
  let candCount = 0;
  let endCount = 0;
  let newsCount = 0;

  for (const race of allRaces) {
    const candRows = race.candidates.map((c, i) => candidateRow(c, race.id, i));
    await upsert("candidates", candRows, "id");
    candCount += candRows.length;

    // Endorsements: clear existing for these candidates, then insert (no natural unique key)
    const candIds = candRows.map((r) => r.id);
    if (candIds.length > 0) {
      await sb.from("endorsements").delete().in("candidate_id", candIds);
      const endRows = race.candidates.flatMap((c, i) => endorsementRows(c, candRows[i].id));
      if (endRows.length > 0) {
        const { error } = await sb.from("endorsements").insert(endRows);
        if (error) throw error;
      }
      endCount += endRows.length;
    }

    // News — race-level
    if (race.news && race.news.length > 0) {
      await upsert("news_items", race.news.map((n) => newsRow(n, race.id, null)), "id");
      newsCount += race.news.length;
    }

    // News — per candidate
    for (let i = 0; i < race.candidates.length; i++) {
      const c = race.candidates[i];
      if (c.news && c.news.length > 0) {
        await upsert("news_items", c.news.map((n) => newsRow(n, null, candRows[i].id)), "id");
        newsCount += c.news.length;
      }
    }
  }

  console.log(`  ✓ ${candCount} candidates`);
  console.log(`  ✓ ${endCount} endorsements`);
  console.log(`  ✓ ${newsCount} news items`);
  console.log("→ Done");
}

async function upsert<T extends { [k: string]: unknown }>(
  table: string,
  rows: T[],
  conflict: string
) {
  if (rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows, { onConflict: conflict });
  if (error) {
    console.error(`✗ Failed seeding ${table}:`, error);
    throw error;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
