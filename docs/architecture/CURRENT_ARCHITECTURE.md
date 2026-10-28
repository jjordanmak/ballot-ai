# Current Architecture (audit, 2026-10-28)

> Status: **as-found** snapshot taken before the November 3, 2026 refresh. Describes what exists, not what should exist.
> Target state: [TARGET_ARCHITECTURE.md](./TARGET_ARCHITECTURE.md) · Sequencing: [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)

## 1. Summary

ballot.ai is a Next.js 16 App Router app deployed on Vercel and backed by a single Supabase Postgres project. It was built for the **California June 2, 2026 Statewide Direct Primary**, and that is the only election in the database. The app is **ZIP-first**: a 5-digit ZIP is mapped to a jurisdiction row with district codes, and races are filtered in JavaScript with rules hardcoded for California and San Mateo County.

All ballot content is hand-authored TypeScript seeded into Supabase. One race (Governor) has deep research. The other sixteen are scaffolds full of `RESEARCH PENDING` placeholders. **There is no LLM code, no test suite, and no CI.**

## 2. Stack and tooling

| Area | Found | Notes |
|---|---|---|
| Framework | Next.js `^16.2.4`, App Router | Both pages are `force-dynamic` (no ISR, despite what the specs say) |
| UI | React 19, Tailwind v4 (`@tailwindcss/postcss`), lucide-react, @dnd-kit | IBM Plex fonts via `next/font` |
| Language | TypeScript 5, `strict` | Path alias `@/*` → `src/*` |
| DB client | `@supabase/supabase-js ^2.105` | Three clients: browser (anon), server (anon), admin (service role) |
| Package manager | npm (`package-lock.json`) | |
| Node | 22 locally, **24.x** on Vercel | Pin with `engines` |
| Lint | ESLint 9 + `eslint-config-next` | `npm run lint` |
| Tests | **none** | No runner, no tests |
| CI | **none** | No `.github/`. Vercel builds are the only gate |
| `server-only` | imported in 5+ files but **not in package.json** | Works today via Next's bundled copy. Fragile |

## 3. Repository layout

```
src/app/page.tsx                         Landing: ZIP + election form (server action)
src/app/ballot/[zip]/[electionId]/page   Ballot view
src/app/api/zip/[zip]/route.ts           ZIP → jurisdiction JSON (used by LandingForm)
src/components/                          13 UI components (+ MobileNav after phase-3-mobile merge)
src/hooks/useScrollSpy.ts                (phase-3-mobile)
src/data/                                Hand-authored seed content (governor, scaffolds, countyRaces, races.ts ABOUT_GUIDE)
src/lib/db/                              getBallot, getElection, getJurisdiction, resolveZip
src/lib/supabase/                        admin/browser/server clients + hand-written types.ts
supabase/migrations/0001..0003           Schema
scripts/seed.ts                          TS → Supabase upsert (service role)
specs/                                   Product + design + phase specs (retroactively written May 2026)
```

## 4. Request flow (as found)

```
/  (LandingForm, client)
  ├─ debounced GET /api/zip/{zip} ─► resolveZip(zip)
  │                                   ├─ jurisdictions table (anon)
  │                                   ├─ miss → Census geocoder w/ ZIP as "address"
  │                                   ├─ districts ONLY from STATIC_DISTRICTS["94015"]
  │                                   └─ upsert via supabaseAdmin  ◄── public-triggered service-role write
  └─ submit (server action) → validate ZIP → resolveZip → getElection → state match
        └─ redirect /ballot/{zip}/{electionId}     (errors → /?error=…, never displayed)

/ballot/{zip}/{electionId}
  getJurisdiction + getElection → getBallot(zip, electionId)
     races where election_id → JS filter raceIsOnBallot():
        statewide → always
        district  → "CA-{us_house}" | "AD-…" | "SD-…" | "BOE-…"   (CA prefixes hardcoded)
        county    → scope_value==="SMC" && county==="San Mateo"  (hardcoded)
     candidates → endorsements + news_items → UI types (src/data/types.ts)
  Realtime: NewsFeed (news_items, filtered); UpdateBar (4 tables, UNFILTERED)
```

## 5. Data model (Supabase project `ballot-ai`)

Migrations `0001_init`, `0002_updatebar_realtime_tables` and `0003_source_provenance_synthesis` match the remote migration history. **No schema drift was detected.**

| Table | Rows (prod) | Purpose | Issues |
|---|---|---|---|
| `elections` | 1 (`ca-2026-primary`) | Election | No slug/status/external IDs. `type` has no CHECK |
| `jurisdictions` | 1 (`94015`) | ZIP → districts JSONB | ZIP-keyed, the wrong abstraction |
| `races` | 17 | Race + editorial intro/issues JSONB | `id` is **globally** unique (`governor`), not per election. No contest type, vote-for-N, or OCD division |
| `candidates` | 48 | Profile-heavy rows (`race__cand` ids) | Mixes ballot facts with editorial (`strengths`, `criticisms`, `voteForIf`, `bottomLine`) |
| `endorsements` | 105 | Category + name | No source |
| `news_items` | 30 | Feed | No URL uniqueness, no URL scheme validation |
| `polls` | 0 | Unused | |
| `sources`, `source_evidence_links` | 0 | Provenance (0003) | **Unused by code** |
| `material_events`, `synthesis_runs`, `synthesized_field_versions` | 0 | Synthesis pipeline (0003) | Unused; RLS on with no policies (service-only, intentional) |

- **RLS:** every table is public `select using (true)`. There are no write policies, so writes require the service role.
- **Advisors:** `touch_updated_at` has a mutable `search_path` (WARN).
- **Generated types:** `src/lib/supabase/types.ts` claims to be generated but is hand-written and missing the 0003 tables.

## 6. Content currently served

- **Election:** CA Statewide Direct Primary, 2026-06-02. **It is in the past.** The landing default falls back to it because no future election exists.
- **Governor:** 10 candidates with headshots, polling percentages, 12-issue stances, endorsements, and news.
- **Other contests:** 7 statewide, 3 district (BOE-2, CA-15, AD-19) and 6 San Mateo County scaffolds, filled with placeholder candidates and `RESEARCH PENDING` text.
- **Missing entirely:** ballot measures, vote-for-N, retention, special districts, school districts, and city contests.
- **Stale copy:** dates are hardcoded in the copy (`AboutGuide`, `races.ts`, Sidebar defaults), and "Undecided 23%" is hardcoded in `RaceHeader`.

## 7. External services

| Service | Status |
|---|---|
| Vercel project `ballot-ai` | Production builds from `main` (last prod deploy May 2026, commit `81d08eb`). Previews from `phase-3-mobile`. SSO protection on previews. Domain `ballot-ai.vercel.app`. **Env-var listing returned 403 to tooling; the owner must audit it** |
| Supabase | One project, `ballot-ai` (us-west-2, PG 17), ACTIVE_HEALTHY. It is both dev and prod; there is no separate dev project or branch |
| Census geocoder | Called with a bare ZIP as an address. Unreliable |
| Google Civic | Not integrated. Network path verified (403 without key) |
| Anthropic | **Not integrated.** Only a commented `ANTHROPIC_API_KEY` in `.env.example` and the 0003 synthesis tables |
| News APIs (GNews, NewsData) | Listed in `.env.example` and specs; not used by code |

## 8. Security observations (no secret values were inspected or printed)

- No private keys use `NEXT_PUBLIC_*`. `.env*` files are gitignored, and `.env.example` has empty values.
- `resolveZip` performs a **service-role write triggered by any anonymous visitor**. It is low-impact but should not stay in the runtime path.
- `admin.ts` throws at module load when the key is missing, so any page that imports it crashes in environments without the key.
- `NewsFeed` renders DB-supplied `url` straight into `href`, so a `javascript:` URL would execute. `Highlight` renders DB HTML through a regex allowlist sanitizer. Both are acceptable for hand-authored content but **not** for ingested or AI content.
- `UpdateBar` subscribes every viewer to every row change in 4 tables.
- `.claude/settings.local.json` and `supabase/.temp/cli-latest` are committed. They are harmless, but they are noise.

## 9. Branches

| Branch | State |
|---|---|
| `main` | Production |
| `phase-3-mobile` | 9 commits of mobile work (MobileNav, useScrollSpy, landing fixes) that were never merged to main. **Merged into `claude/loving-curie-e7gtw3` on 2026-10-28** |
| `codex-stabilize-foundation` | No commits beyond main (stale) |

## 10. Documentation drift

- Phase numbering conflicts. CLAUDE.md, AGENTS.md and README use 3=ingestion, 4=synthesis, 5=mobile. The `specs/` files use 3=mobile, 4=ingestion, 5=synthesis.
- The candidate-coverage rules are "confirmed" in `specs/phase-4-ingestion.md` but "unresolved" in CLAUDE.md.
- `specs/data-model.md` shows un-namespaced candidate IDs, but the real IDs are `race__cand`.
- The memory file referenced by CLAUDE.md is not present in cloud sessions.

## 11. Component classification

| Component / system | Decision | Rationale |
|---|---|---|
| Design tokens (`globals.css`), typography, `<mark>` system | **KEEP** | Brand. Load-bearing rules in CLAUDE.md |
| `Sidebar`, `MobileNav`, `useScrollSpy` | **KEEP / REFACTOR** | Generalize the input from `Race[]` to contest nav items |
| `CandidateProfile`, `ComparisonTable`, `CandidatesHeader`, `NewsFeed`, `RaceHeader`, `SuspendedList` | **KEEP** (archive + Tier 2/3 enrichment) | Rich UI. Renders only when enrichment exists |
| `Highlight` | **KEEP** | Revisit auto-highlighting against the neutrality principle (PRD open question) |
| `UpdateBar` | **REFACTOR** | Scope to the archive view, or filter subscriptions to the rendered ballot |
| `AboutGuide` | **REFACTOR** | Hardcoded June copy. Make election-aware |
| `LandingForm` + ZIP server action + `/api/zip` | **REPLACE** | ZIP cannot determine an exact ballot. Replace with an address form |
| `resolveZip`, `STATIC_DISTRICTS`, `jurisdictions` | **REMOVE from runtime path** (keep for archive) | Imprecise, CA-only, public-triggered service write |
| `getBallot` + `raceIsOnBallot` | **REFACTOR → archive-only fetcher** | Hardcoded CA/SMC rules don't generalize. The new path uses the provider architecture |
| `/ballot/[zip]/[electionId]` route | **REPLACE** (redirect to `/archive/...`) | ZIP in the URL. Superseded by the address-free ballot key |
| `races`/`candidates`/`endorsements`/`news_items` tables | **KEEP** | Archive + enrichment store. Not dropped |
| 0003 provenance tables | **KEEP + extend** | `sources` becomes the provenance backbone |
| Hand-written `types.ts` | **REPLACE** | With Supabase-generated types |
| `scripts/seed.ts` | **KEEP** | Seeds the archive. New seeders handle official records |
