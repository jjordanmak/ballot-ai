# Migration Plan

> From [CURRENT](./CURRENT_ARCHITECTURE.md) to [TARGET](./TARGET_ARCHITECTURE.md). Detailed tasks: [2026-11-03 IMPLEMENTATION_PLAN](../elections/2026-11-03/IMPLEMENTATION_PLAN.md).

Every step is additive. There are no destructive database changes, and production data for the June primary stays intact.

## 1. Classification

| System | Decision | Why / how |
|---|---|---|
| Design tokens, typography, `<mark>`, sticky patterns | **KEEP** | Brand rules in CLAUDE.md |
| `Sidebar`, `MobileNav`, `useScrollSpy` | **KEEP → REFACTOR** | Accept generic nav items (contest id + label) instead of `Race[]` |
| `CandidateProfile`, `ComparisonTable`, `CandidatesHeader`, `NewsFeed`, `RaceHeader`, `SuspendedList`, `AboutGuide` | **KEEP** (archive) | Used by `/archive`. New ballot cards reuse tokens and patterns, not these components, until enrichment exists |
| `Highlight` | **KEEP** | Auto-highlight scope is an open question (PRD Q3) |
| `UpdateBar` | **KEEP (archive only)** | New ballot data changes through re-resolution, not Realtime |
| `LandingForm` + ZIP server action | **REPLACE** | Replaced by `AddressForm` + `resolveBallotAction`. ZIP cannot determine a ballot |
| `/api/zip/[zip]` | **REMOVE** (after the archive no longer needs it) | Public route that triggers a service-role write. Nothing on the new UI calls it. Deleted in step 7 |
| `resolveZip` + `STATIC_DISTRICTS` | **REMOVE from runtime** | Imprecise and CA-only. The archive route reads the `jurisdictions` table directly |
| `getBallot` / `raceIsOnBallot` | **REFACTOR** | Becomes the archive-only fetcher. No logic changes |
| `/ballot/[zip]/[electionId]` | **REPLACE** | Moves to `/archive/[electionId]/[zip]`. A `next.config` redirect matches `/ballot/:zip(\d{5})/:electionId` |
| `admin.ts` | **REFACTOR** | Lazy `getSupabaseAdmin()`, so a missing key fails per call and not at module load |
| `src/lib/supabase/types.ts` | **REPLACE** | Generated with Supabase `generate_typescript_types` after 0004 |
| Legacy tables (`races` …) | **KEEP** | Archive + future enrichment link via `contest_candidates.legacy_candidate_id` |
| 0003 provenance tables | **KEEP + extend** | |
| `scripts/seed.ts` | **KEEP** | Seeds the archive only |
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
