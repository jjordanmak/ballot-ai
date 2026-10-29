# Migration Plan

> From [CURRENT](./CURRENT_ARCHITECTURE.md) to [TARGET](./TARGET_ARCHITECTURE.md). Detailed tasks: [2026-11-03 IMPLEMENTATION_PLAN](../elections/2026-11-03/IMPLEMENTATION_PLAN.md).

Every step is additive. There are no destructive database changes, and production data for the June primary stays intact.

## 1. Classification

| System | Decision | Why / how |
|---|---|---|
| Design tokens, typography, `<mark>`, sticky patterns | **KEEP** | Brand rules in CLAUDE.md |
| `Sidebar`, `MobileNav`, `useScrollSpy` | **KEEP → REFACTOR** | Accept generic nav items (contest id + label) instead of `Race[]` |
| `CandidateProfile`, `ComparisonTable`, `CandidatesHeader`, `NewsFeed`, `RaceHeader`, `SuspendedList` | **KEEP** (shared) | Used by both the November ballot page (fed by enrichment and the live feed) and the deprecated June snapshot. A render test on the snapshot catches shared-component regressions |
| `AboutGuide` | **KEEP** (deprecated snapshot only) | |
| `Highlight` | **KEEP** | Auto-highlight scope is an open question (PRD Q3) |
| `UpdateBar` | **REMOVED** | The snapshot is frozen, so there is nothing to update. The November page gets new feed items live through one Realtime Broadcast channel (`LiveFeed`), with no Update button. The old `news_items` subscription is gone too |
| `LandingForm` + ZIP server action | **REPLACE** | Replaced by `AddressForm` + `resolveBallotAction`. ZIP cannot determine a ballot |
| `/api/zip/[zip]` | **REMOVED** | Public route that triggered a service-role write. Deleted in step 7 |
| `resolveZip` + `STATIC_DISTRICTS` | **REMOVED from runtime** | Imprecise and CA-only |
| `getBallot` / `raceIsOnBallot` (`src/lib/db/*`) | **REMOVED** | The June primary is now a deprecated snapshot (`src/data/deprecated/2026-06-02-ca-primary.json`, built by `scripts/snapshot-deprecated.ts` from an export of the June rows). Its pages never read the database |
| `/ballot/[zip]/[electionId]` | **REPLACE** | A `next.config` redirect matches `/ballot/:zip(\d{5})/:electionId`: → `/` in production, → `/archive/[electionId]/[zip]` locally and on previews. `/archive` 404s in production |
| `admin.ts` | **REFACTOR** | Lazy `getSupabaseAdmin()`, so a missing key fails per call and not at module load |
| `src/lib/supabase/types.ts` | **REPLACE** | Generated with Supabase `generate_typescript_types` after 0004 |
| Legacy tables (`races` …) | **KEEP** | Data kept intact; the June `elections` row is `deprecated` (0009). Future enrichment can link via `contest_candidates.legacy_candidate_id` |
| 0003 provenance tables | **KEEP + extend** | |
| `scripts/seed.ts` | **REMOVED** | `npm run seed` is gone. The snapshot script replaces it for the June data |
| `specs/` | **KEEP** | Historical record. `specs/product.md` points to the canonical PRD |

## 2. Sequence

| # | Step | Risk | Rollback |
|---|---|---|---|
| 0 | Merge `phase-3-mobile` into the working branch (**done**) | Low | Revert merge |
| 1 | Docs (this set) | None | — |
| 2 | Tooling: `server-only` dependency, `vitest`, `typecheck` script, CI workflow, lazy admin client | Low | Revert commit |
| 3 | Domain types, provider interfaces, Civic client/normalizer, fixture resolver, validators, plus unit tests | None (no UI wiring) | Revert |
| 4 | Migration 0004 written and **reviewed by the owner**, then applied to production via Supabase MCP. Types regenerated. Advisors re-run. Row counts checked unchanged (1/1/17/48/105/30) | Medium (production DB, additive only) | `0004_down.sql` drops only the new tables and columns |
| 5 | Application service + persistence (`ballot_resolutions`, `resolution_events`) + redacting logger | Low | Feature-flagged by `BALLOT_PROVIDER` |
| 6 | New UI: address landing, `/ballot/[electionSlug]/[ballotKey]`, status pages, `/archive` + redirect | Medium (user-facing) | Vercel instant rollback to the previous production deployment |
| 7 | Remove `/api/zip` and `resolveZip` from runtime. Update CLAUDE.md, AGENTS.md, and README | Low | Revert |
| 8 | Live Daly City QA (needs `GOOGLE_CIVIC_API_KEY` + `BALLOT_QA_ADDRESS_94015`). Durable official records for Daly City contests | — | — |
| 9 | Merge to `main` → production deploy → smoke test | Medium | Vercel rollback |
| 10 | P1: CA and US coverage QA, normalization fixes | Low | — |

## 3. Production safeguards

- **Database:** Supabase daily backups (owner confirms the plan includes PITR or daily backups). The migration is additive, so no data is rewritten.
- **Deploy:** previews from the branch first. Production only after preview smoke tests. Vercel instant rollback is available.
- **Secrets:** no rotation until the new deploy is verified ([ENVIRONMENT](../infrastructure/ENVIRONMENT.md) §3).
