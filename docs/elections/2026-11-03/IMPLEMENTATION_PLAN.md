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
| P0-8 | Migration 0004 (additive) → **owner reviews SQL** → apply → regenerate types → advisors | P0-4 | done (0004 and 0005 applied 2026-10-28) |
| P0-9 | Application service `resolveBallot` + `ballot_resolutions` persistence + `resolution_events` + redacting logger | P0-5, P0-8 | done |
| P0-10 | Address-first landing + server action + status error copy | P0-9 | done |
| P0-11 | Ballot page `/ballot/[electionSlug]/[ballotKey]`: grouped contests, vote-for-N, choices, measures, sources, freshness, partial/expired banners, `noindex` | P0-9 | done |
| P0-12 | Archive the June primary at `/archive/[electionId]/[zip]` + legacy redirect | — | done |
| P0-13 | Remove `/api/zip` from runtime. Update CLAUDE.md, AGENTS.md, README | P0-10 | done |
| P0-14 | Browser verification (Playwright, desktop + 390px) with the fixture provider | P0-11 | done |
| P0-15 | **Live Daly City QA** → `reports/2026-11-03/daly-city-qa.md` + normalized fixture. Verify every contest against SMC / SoS / Daly City | creds | **done 2026-10-28:** all **49 contests verified, 0 discrepancies** against the CA SoS certified list, the SoS qualified-measures list, the Daly City Clerk nominee list, the San Mateo County roster of candidates and the county's measure list (`reports/2026-11-03/daly-city-verification.md`). **Provider gap found and fixed:** Civic omitted all 13 judicial retention contests, which are now added from the certified list |
| P0-16 | Official records for the verified Daly City contests and statewide propositions | P0-15 | **partly done:** judicial retention for all of CA (64 contests, by county); official proposition titles, summaries, YES/NO meanings, fiscal effects and arguments for all 14 props; ballot designations and incumbency for 22 candidates; official proper-case names for all 64 CA retention justices (SoS voter guide justices pages); Daly City council facts. Stored as reviewed files (`src/data/official`, `src/data/enrichment`), not database rows, for review speed before Nov 3 |
| P0-17 | Production deploy (merge to main) + smoke test + Google key in Vercel | P0-14, owner | |

## P1: before or around Nov 3, as time allows

> Owner decision 2026-10-28: finish the desktop web version first. The tablet and mobile responsive pass comes after desktop is final.

| ID | Task |
|---|---|
| P1-1 | California coverage QA: about 12 diverse counties using public (government-building) addresses → `california-coverage.md` |
| P1-2 | US coverage QA: one public address per state + DC (e.g. the state capitol) → `us-coverage.md` |
| P1-3 | Fix systemic normalization failures found in P1-1 and P1-2 |
| P1-4 | `divisionsByAddress` → OCD IDs for division keys |
| P1-5 | Expired `ballot_resolutions` cleanup (Vercel cron) + quota monitoring |
| P1-6 | Statewide proposition official links (CA SoS Official Voter Information Guide) as durable `measures` |
| P1-7 | Address autocomplete (owner request 2026-10-28): **built 2026-10-28.** Server-side Google Places API (New) proxy (`/api/address/suggest`, `/api/address/place`), server-only `GOOGLE_PLACES_API_KEY`, session tokens, no logging, same-site only; manual entry keeps working. Verified with simulated Google responses; live check pending on the Vercel preview |
| P1-8 | Voters registered by cross streets or a description (no house number): **handoff built 2026-10-29.** When input has no house number and no ballot is found, the form says a home street address is needed and links the state's official voter lookup (Civic `electionRegistrationConfirmationUrl`, e.g. CA My Voter Status; national fallback canivote.org). Map-point district lookup is parked as a feature idea (see P3), not planned |
| P1-9 | Live content (owner decisions 2026-10-29: Vercel Pro, auto-publish, no Update button, no social collection yet): **built 2026-10-29, migration 0008 awaiting owner review.** November contests and candidates are stored durably at resolve time (`src/lib/ballot/durable.ts`); a news collector (`/api/cron/news`, every 2 minutes) reads 22 approved sources (`src/data/sources/news.json`, pending owner approval), matches articles to tracked contests and candidates, runs automated checks and publishes to `feed_items`; a daily job retracts dead links. Ballot pages show items live through one Realtime channel and "Last updated" tracks the newest item. Needs `CRON_SECRET` and the merge to main (crons run on production only) |
| P1-10 | Official links in profile headers: **built 2026-10-29.** Campaign website and X account from official filings (SoS voter guide statements, San Mateo County roster `Website` field; `ca-official-links.json`, 24 candidates), plus X accounts the daily job finds on a candidate's own campaign site (`src/lib/feeds/links.ts` → `candidate_links`). Each link is cited; nothing is guessed or searched |

## P2: after the election / next cycle

- **Supabase key migration**: swap the legacy `anon` and `service_role` keys for `sb_publishable_` and `sb_secret_` keys on every surface, then disable the legacy keys. This also covers the overdue service-role rotation. Steps are in [ENVIRONMENT.md §3.1](../../infrastructure/ENVIRONMENT.md#31-post-election-move-to-supabases-new-api-keys). Do it after results are certified, not during election week.
- Offline enrichment pipeline (Claude, central config).
- Measure explainers.
- Tier 2 candidate profiles.
- Public candidate and measure pages.
- Accessibility audit.
- Multilingual support.
- Resolve PRD open questions 1–4.

## P3: provider independence

- Feature idea (owner, parked): resolve cross-street / description registrations by geocoding to a map point and checking official district boundaries.

- VIP bulk feed resolver.
- State and county direct resolvers.
- Composite merge with source priority.
- Reduced Google dependency.

## Explicitly out of scope for Nov 3

News ingestion, polling, AI synthesis, endorsements for the general, and photo resolution.
