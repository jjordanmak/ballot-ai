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
| P0-12 | Archive the June primary at `/archive/[electionId]/[zip]` + legacy redirect | — | done; since 2026-10-29 a deprecated internal snapshot (404 in production, legacy URLs → `/`; migration 0009) |
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
| P1-2 | US coverage QA: one public address per state + DC (e.g. the state capitol) → `us-coverage.md`. Note: Civic answers only for voter-file residential addresses (government buildings return no contests), so this can't pre-seed other states' contests for the news collector; they are tracked once a voter there looks up a ballot |
| P1-3 | Fix systemic normalization failures found in P1-1 and P1-2 |
| P1-4 | `divisionsByAddress` → OCD IDs for division keys |
| P1-5 | Expired `ballot_resolutions` cleanup (Vercel cron) + quota monitoring |
| P1-6 | Statewide proposition official links (CA SoS Official Voter Information Guide) as durable `measures` |
| P1-7 | Address autocomplete (owner request 2026-10-28): **built 2026-10-28.** Server-side Google Places API (New) proxy (`/api/address/suggest`, `/api/address/place`), server-only `GOOGLE_PLACES_API_KEY`, session tokens, no logging, same-site only; manual entry keeps working. Verified with simulated Google responses; live check pending on the Vercel preview |
| P1-8 | Voters registered by cross streets or a description (no house number): **handoff built 2026-10-29.** When input has no house number and no ballot is found, the form says a home street address is needed and links the state's official voter lookup (Civic `electionRegistrationConfirmationUrl`, e.g. CA My Voter Status; national fallback canivote.org). Map-point district lookup is parked as a feature idea (see P3), not planned |
| P1-9 | Live content (owner decisions 2026-10-29: Vercel Pro, auto-publish, no Update button, no social collection yet): **built 2026-10-29; migration 0008 applied 2026-10-29.** November contests and candidates are stored durably at resolve time (`src/lib/ballot/durable.ts`); a news collector (`/api/cron/news`, every 2 minutes) reads about 160 approved sources nationwide (`src/data/sources/news.json`, pending owner approval: national, every state plus DC, and the largest metros; state and local outlets match only their own state's contests; see SOURCE_STRATEGY §5), matches articles to tracked contests and candidates, runs automated checks and publishes to `feed_items`; a daily job retracts dead links. Ballot pages show items live through one Realtime Broadcast channel per election and state and "Last updated" tracks the newest item. `CRON_SECRET` is set by the owner in Vercel; crons run only after the merge to main (production only) |
| P1-10 | Official links in profile headers: **built 2026-10-29.** Campaign website and X account from official filings (SoS voter guide statements, San Mateo County roster `Website` field; `ca-official-links.json`, 24 candidates), plus X accounts the daily job finds on a candidate's own campaign site (`src/lib/feeds/links.ts` → `candidate_links`). Each link is cited; nothing is guessed or searched |
| P1-11 | Live polls: **built 2026-10-29.** `/api/cron/polls` (every 20 minutes) reads poll tables on Wikipedia's election pages for tracked contests and publishes polls from approved pollsters (`src/data/sources/pollsters.json`, 50, owner review pending) that pass the automated checks (SOURCE_STRATEGY §5.1). The race polling card shows the newest live poll with a "Poll list via Wikipedia (CC BY-SA)" credit |

## Pre-merge audit (2026-10-29)

National correctness, failure handling and live-feed safety, all built and on the branch:

| Area | What changed |
|---|---|
| Election day | "Today" is the Hawaii date (`electionToday()` in `src/domain/electionDay.ts`), so Nov 3 stays current until the last polls close |
| Division keys | Every non-OCD key starts with the lowercase state code (`tx:statelower:12:state house district 12`); DC uses `ocd-division/country:us/district:dc`. Durable registration is insert-if-missing then read ids, de-dupes batches, tells same-title contests apart by candidate names, and fills the division's state from the key |
| Districts | From contest scope/category first, OCD ids second (`src/domain/districts.ts`); at-large seats show `XX-AL`; per-state chamber names in `DistrictLine.tsx` |
| Parties | Ballot wording shown verbatim (`partyName`); colors only for Democratic, Republican, Green and Libertarian; every other party neutral gray |
| Statewide contests | Statewide offices and measures recognized in every state; the measures heading uses the ballot's own term; retention detected from wording; ranked-choice contests (AK state and federal, ME federal, SF, Oakland/Berkeley/San Leandro/Albany, Portland OR) say "Rank candidates" |
| Failures | Never a 500: storage errors map to `PROVIDER_ERROR` or an "unavailable" view; branded error, not-found and global-error pages; "Where to vote" link on every ballot |
| Landing | Election dropdown (next election preselected) once the address is complete; the button waits for both; the server validates the slug |
| Database | 0008 `live_feed` and 0009 `deprecated_elections` applied. Feed reaches pages via Realtime Broadcast per election and state; first load via `ballot_feed()`; public read is published items only |
| June primary | Deprecated internal snapshot; DB fetchers, seed script, UpdateBar and the old `news_items` subscription removed |
| Feeds | Due-based news collector with safe outbound fetch (public hosts only, redirects checked, 5 MB cap); daily retraction recheck and weekly X-link discovery; live polls (P1-11); matcher keeps state and local outlets to their own state |
| Security and privacy | Places proxy refuses non-same-site requests; cron auth timing-safe; highlighter escapes all text, neutral auto-highlight on Nov 3 surfaces; Civic errors log only reason code and status |
| CI | Node 24; `npm run typecheck` also checks `scripts/` |

**Owner actions before and at merge:**
1. Add a Vercel firewall rate-limit rule: 60 requests/minute per IP on `/api/address/` (tooling could not create the firewall config).
2. Review the approved pollster list (`src/data/sources/pollsters.json`). (News sources approved 2026-10-29.)
3. Merge to `main` (crons run on production only; previews are behind Vercel login).
4. Right after the merge: check the first cron runs (`feed_source_state`, Vercel runtime logs), disable dead feeds, and confirm items arrive live on a ballot page.

## Deferred from the audit (Tier 3)

- Multiple concurrent elections and runoffs; state-specific Civic election ids.
- Official retention lists outside California.
- Named district ids (VT, NH, MA, AK).
- Tooltips for multi-member districts.
- Places suggestions for territories.
- CSP and site-wide security headers.
- Matcher indexing at scale.
- Sharding the quota counter's hot row.
- Playwright and `npm audit` in CI.
- Pre-seeding other states' statewide contests (see P1-2).

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

AI synthesis, endorsements for the general, and photo resolution. (News ingestion and live polls shipped as P1-9 and P1-11.)
