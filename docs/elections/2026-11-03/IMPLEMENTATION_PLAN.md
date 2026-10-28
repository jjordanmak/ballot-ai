# November 3, 2026 General Election: Implementation Plan

> Architecture: [TARGET](../../architecture/TARGET_ARCHITECTURE.md) · Sequence: [MIGRATION_PLAN](../../architecture/MIGRATION_PLAN.md) · Sources: [SOURCE_STRATEGY](./SOURCE_STRATEGY.md) · QA: [QA_PLAN](./QA_PLAN.md)

**Context:** work starts 2026-10-28, which is 6 days before Election Day. California mailed ballots in early October, so many voters already hold them. The plan therefore puts Tier 0 correctness and reliability first, and enrichment is explicitly deferred.

## P0: must ship before Nov 3

| ID | Task | Depends on | Status |
|---|---|---|---|
| P0-1 | Merge `phase-3-mobile` | — | done |
| P0-2 | Full doc set (PRD + architecture + this plan) | — | done |
| P0-3 | Tooling: `server-only`, vitest, `typecheck`, CI workflow, lazy admin client, `engines` | — | done |
| P0-4 | Domain model (`src/domain/`) | — | done |
| P0-5 | Provider interfaces + `GoogleCivicElectionProvider` + `GoogleCivicBallotResolver` (client, normalize, error mapping) + `FixtureBallotResolver` + `CompositeBallotResolver` stub | P0-4 | done |
| P0-6 | Validators + `scripts/validate-ballot.ts` (JSON + MD output) | P0-4 | done |
| P0-7 | Unit tests: normalization (candidate, retention, referendum, vote-for-N, unknown type, duplicates), status mapping, ballot key, redaction | P0-5 | done |
| P0-8 | Migration 0004 (additive) → **owner reviews SQL** → apply → regenerate types → advisors | P0-4 | done (applied 2026-10-28; 0005 election row ships with the deploy) |
| P0-9 | Application service `resolveBallot` + `ballot_resolutions` persistence + `resolution_events` + redacting logger | P0-5, P0-8 | done |
| P0-10 | Address-first landing + server action + status error copy | P0-9 | done |
| P0-11 | Ballot page `/ballot/[electionSlug]/[ballotKey]`: grouped contests, vote-for-N, choices, measures, sources, freshness, partial/expired banners, `noindex` | P0-9 | done |
| P0-12 | Archive the June primary at `/archive/[electionId]/[zip]` + legacy redirect | — | done |
| P0-13 | Remove `/api/zip` from runtime. Update CLAUDE.md, AGENTS.md, README | P0-10 | done |
| P0-14 | Browser verification (Playwright, desktop + 390px) with the fixture provider | P0-11 | done |
| P0-15 | **Live Daly City QA** → `reports/2026-11-03/daly-city-qa.md` + normalized fixture. Verify every contest against SMC / SoS / Daly City | creds | **blocked on `GOOGLE_CIVIC_API_KEY` + `BALLOT_QA_ADDRESS_94015`** |
| P0-16 | Durable official records for the verified Daly City contests and statewide propositions (`contests`, `measures`, `sources`) | P0-15 | |
| P0-17 | Production deploy (merge to main) + smoke test + Google key in Vercel | P0-14, owner | |

## P1: before or around Nov 3, as time allows

| ID | Task |
|---|---|
| P1-1 | California coverage QA: about 12 diverse counties using public (government-building) addresses → `california-coverage.md` |
| P1-2 | US coverage QA: one public address per state + DC (e.g. the state capitol) → `us-coverage.md` |
| P1-3 | Fix systemic normalization failures found in P1-1 and P1-2 |
| P1-4 | `divisionsByAddress` → OCD IDs for division keys |
| P1-5 | Expired `ballot_resolutions` cleanup (Vercel cron) + quota monitoring |
| P1-6 | Statewide proposition official links (CA SoS Official Voter Information Guide) as durable `measures` |

## P2: after the election / next cycle

- Places Autocomplete evaluation.
- Offline enrichment pipeline (Claude, central config).
- Measure explainers.
- Tier 2 candidate profiles.
- Public candidate and measure pages.
- Accessibility audit.
- Multilingual support.
- Resolve PRD open questions 1–4.

## P3: provider independence

- VIP bulk feed resolver.
- State and county direct resolvers.
- Composite merge with source priority.
- Reduced Google dependency.

## Explicitly out of scope for Nov 3

News ingestion, polling, AI synthesis, endorsements for the general, and photo resolution.
