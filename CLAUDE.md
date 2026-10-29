# ballot.ai — instructions for AI assistants

This file auto-loads in every Claude Code session in this repo. **Read it fully before doing any work.**

> **Keep in sync with `AGENTS.md`** (the Codex counterpart). Any time you update one, update the other. The files share all project rules; only the tool/environment-specific lines differ.

For deeper context (decisions, history, open questions): `docs/` (canonical), the local memory file `~/.claude/projects/<this-folder>/memory/project_ballot_ai.md` if present (absent in cloud sessions), and the last 10–15 git commits (`git log --oneline -15`) — both have rich notes.

---

## What this is
A live, source-grounded voter guide. **Enter your address. Get your ballot. Understand every choice.** Given a residential address, it resolves the exact contests, candidates and measures on that voter's ballot (via a provider layer — Google Civic today) and explains them with sourced facts. Goal: nationally scalable, fully data-driven, politically neutral.

**Canonical docs:** product → `docs/product/PRD.md`; architecture → `docs/architecture/` (start with `TARGET_ARCHITECTURE.md`); Nov 3, 2026 plan → `docs/elections/2026-11-03/`.

## Stack
Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript strict · Supabase Postgres (with RLS + Realtime) · Vercel · IBM Plex serif/sans/mono. Brand is **`ballot.ai`** (lowercase `b`).

---

## Hard rules — do NOT violate

### Brand & copy
- The product name is **`ballot.ai`** (lowercase `b`). Not "Ballot.ai", not "Ballotwise", not "Voterly".
- Slogan: **"a guide to your ballot"**. Not "your live sample ballot".
- Tab titles: landing = `ballot.ai • your voting guide`; ballot = `ballot.ai • your voting guide for [City, ST]` (coarse location — never a street or full address).

### Color discipline (this is load-bearing)
- **Yellow accent** (`--color-accent`, golden ~`oklch(80% 0.155 82)`): ONLY for `<mark>` highlights and small UI accents (icons in section eyebrows, hover states, the polling rail). NEVER as a tinted background on cards/tables/profiles.
- **Red and blue**: reserved EXCLUSIVELY for Republican / Democratic party encoding. Never use them for status, errors, links, or anything else.
- **Other party colors** (owner, 2026-10-29): a party gets a color only if it's as strongly tied to one as red/blue are to Rep/Dem — today Green (green) and Libertarian (gold `--color-lib`, distinct from the yellow accent). Every other party is neutral gray, and the pill always prints the party exactly as the ballot data names it (`Candidate.partyName`). Party is never shown by color alone.
- **Trend-down** uses `--color-trend-down` (a muted red, distinct from rep red).
- **Backgrounds**: chroma is pulled to ~0.003 so cards/tables/profiles read as honest gray, not yellow-tinted. If you reach for a yellow-tinted bg, that's wrong.
- **Supplementary tints** (orange / green / teal / purple / pink): allowed for data encoding (key-section pillars, endorsement categories) but never as primary surface bg.

### Highlights (`<mark>`)
- Solid-fill bar (no gradient) with rounded corners. Already styled in `globals.css`.
- Auto-highlight algorithm in `src/components/Highlight.tsx` runs at render. Manual `<mark>` tags pass through. Don't disable it without a reason.
- Nov 3 ballot surfaces pass `auto="neutral"`: only structural facts (amounts, percentages, counts, vote thresholds, dates, measure numbers) are auto-highlighted — no topical phrases, superlatives, "leading"/"frontrunner". The highlighter escapes all text and re-allows only `mark`/`strong`/`em`/`br`.
- For AI synthesis (Phase 5): the LLM prompt should wrap 2–3 load-bearing phrases per text field in `<mark>`.

### Sticky behavior pattern
- Comparison sticky group: `sticky top-0 z-[100] bg-[var(--color-ink-0)] pt-8`; it includes the eyebrow row, chip toolbar, and table header so the comparison controls pin as one opaque unit.
- Candidate profiles sticky group: `relative sticky top-0 z-[100] pt-8 pb-8`; the translucent/masked background is an absolute layer behind the eyebrow and controls.
- Individual candidate profile headers are **not sticky**; each candidate `<button>` scrolls with its article and stays `bg-[var(--color-ink-1)] rounded-t-xl`.
- Sidebar remains `sticky top-0 left-0 h-screen`.

### Section headings (3 places must match)
"In the news" / "Side-by-side" / "Candidate profiles" all use the SAME shape: `font-mono-cap text-[11px] text-paper + lucide icon size=12 className="text-accent" + tracking-[0.16em]`. Don't drift one of them.

### Sidebar
- Brand renders as `ballot` + `<span className="text-paper-3">.ai</span>`. Lowercase, the dot+ai is gray.
- Race nav dropdowns expand on EITHER hover OR scroll-spy active. Don't change to one or the other.
- "Top" button is always visible — disabled (muted gray) when at top, enabled when scrolled.
- "Change" button is a `<Link href="/">` (back to landing).

### Address-first, privacy, neutrality (load-bearing)
- **Address, not ZIP.** The ballot is resolved from a residential address. Never reintroduce a ZIP-first "your ballot" flow; ZIP alone can't determine a ballot.
- **Never persist, log, or send the residential address anywhere but the ballot provider.** Wrap it in `AddressInput` (`src/lib/providers/address.ts`); log only via `logEvent` (`src/lib/observability/log.ts`), which redacts. No address in URLs, Supabase, fixtures, reports, analytics, or Anthropic prompts. See `docs/architecture/PRIVACY.md`.
- **UI depends on the domain model only** (`src/domain/`). Provider response shapes stop in `src/lib/providers/<provider>/`.
- **A provider failure is never an empty ballot.** Every `ResolutionStatus` has its own copy (`src/lib/ballot/copy.ts`).
- **AI never decides ballot facts** (which contests apply, names, vote-for-N, measure wording, dates). AI output is labeled, sourced, and offline — never on page load. See `docs/architecture/AI_ARCHITECTURE.md`.
- **Neutrality:** no rankings, recommendations, predictions, "vote for X if", strengths/criticisms, or evaluative adjectives in new surfaces. Profiles use the PRD §11.5 FR-K4 sections, every item cited.

### Other rules
- DB column was renamed `current_role` → `current_position` (Postgres reserved word). TS still uses `currentRole`; only the deprecated June snapshot uses those tables (mapper: `scripts/lib/deprecatedBallot.ts`).
- **Deprecated June 2026 primary** (`/archive/[electionId]/[zip]`): internal reference only. It renders from a frozen snapshot (`src/data/deprecated/`, rebuilt by `scripts/snapshot-deprecated.ts`), never the database; it 404s in production and works locally and on Vercel previews; nothing links to it. A render test (`src/components/deprecated/JunePrimary.test.tsx`) must keep passing when shared components change. A user-facing archive of past elections is a future feature (`elections.status = 'archived'`).
- (Nov 3 ballot page) **No Update button.** New feed items (news, polls) appear live through one Realtime **Broadcast** channel per page, `feed:{election}:{state}` (`src/components/ballot/LiveFeed.tsx`, trigger in migration 0008); "Last updated" is when the newest item appeared on this ballot (`ingested_at`), falling back to the ballot's retrieved time. Items auto-publish when they pass the automated checks in `src/lib/feeds/` — there is no manual queue.
- **National by default.** Nothing may assume California: division keys carry the state, districts/chambers/categories come from the provider's division and scope, measure headings use the ballot's own term, copy says "local election office". Add a test for at least one non-CA case with any ballot logic change.
- **Sources per block; vote needed everywhere.** Each race, measure and profile ends with its own Sources block (ballot data first; one source → no inline markers). Every race and measure states what it takes to win or pass, with the share's base, from `src/domain/voteNeeded.ts` (verified, cited rules only). Measures answer the same six "What it means for you" questions from official analyses only. See `specs/design-system.md`.
- **Election day ends in Hawaii.** "Today" for elections is `electionToday()` (`src/domain/electionDay.ts`), never the UTC date.
- Suspended candidates render with a red status pill, NOT yellow/orange.

---

## Behavioral expectations

1. **Pause before every task and recommend tooling.** Before any planning or coding, tell the user: (a) whether to use Claude Code or Codex and why, (b) which model (Sonnet 4.6 / Opus 4.6 Fast / Opus 4.7 / Opus 4.7 1M), (c) effort level (Low / Medium / High), (d) any relevant skills, (e) whether to use Plan mode or Auto mode. Wait for confirmation before proceeding.
2. **Verify in browser before claiming done.** A preview server is running. Use the Claude_Preview MCP (`preview_eval`, `preview_screenshot`, `preview_inspect`) for any visible change.
3. **Don't add features the user didn't ask for.** A bug fix doesn't need surrounding cleanup. A small UI change doesn't need a refactor.
4. **Check the memory file + recent commits before structural changes.** If you're about to undo something, check git log first — there's probably a reason it's that way.
5. **Match existing conventions** — colors via CSS variables (`var(--color-X)`), components co-located in `src/components/`, server data access in `src/lib/ballot/` (ballots) and `src/lib/feeds/` (collectors).
6. **Ask before changing the design system.** If a request implies "use a different color" or "change the spacing rhythm", confirm before doing it.

---

## Where things live

```
src/
├── app/
│   ├── page.tsx                       Landing (address form)
│   ├── actions.ts                     Server action: address → ballot → redirect
│   ├── ballot/[electionSlug]/[ballotKey]/page.tsx   Ballot view (address-free key, noindex)
│   ├── archive/[electionId]/[zip]/page.tsx          Deprecated June 2026 primary (frozen snapshot; previews only)
│   ├── api/address/*                  Places suggestion proxy (same-site only, monthly cap)
│   ├── api/cron/*                     Collectors: news (2 min), polls (20 min), news-recheck (daily)
│   ├── layout.tsx                     Root metadata, fonts
│   └── globals.css                    Design tokens, mark styles, animations
├── components/                        UI components (one per concern); ballot/ = new ballot view
├── domain/                            Provider-independent ballot types (the UI's only data contract)
├── data/                              enrichment/ + official/ (Nov 3 researched data), sources/ (news outlets, pollsters), deprecated/ (frozen June snapshot), June TS content
└── lib/
    ├── ballot/                        Application service: resolve, load, store, validate, copy
    ├── providers/                     BallotResolver/ElectionProvider + google-civic/ + fixture/
    ├── feeds/                         News + poll collectors, matcher, checks, safe fetch, X-link discovery
    ├── usage/                         Monthly API quota (Places)
    ├── observability/                 Redacting logger
    └── supabase/                      Typed clients (server/browser/admin) + DB types
supabase/
└── migrations/                        SQL migrations
scripts/
├── snapshot-deprecated.ts             Rebuilds the frozen June snapshot from an export of its rows
├── validate-ballot.ts                 Validators over fixtures (`npm run validate:ballots`, CI)
└── qa-resolve.ts                      Live QA from a private env address (`npm run qa:resolve`)
docs/                                  PRD, architecture, environment, election plans (canonical)
specs/                                 Historical specs + design system (PRD in docs/ supersedes specs/product.md)
├── product.md                         Vision, target user, brand, non-goals
├── design-system.md                   Full palette, typography, highlight system, sticky patterns
├── data-model.md                      All DB tables, JSONB shapes, TS conventions, Realtime setup
├── ballot-view.md                     Sidebar, comparison table, candidate profiles, news feed
├── phase-3-mobile.md                  Mobile responsive spec + definition of done
├── phase-4-ingestion.md               News cron, photo resolver, source ingestion
└── phase-5-synthesis.md               Perplexity/Claude pipeline, output schema, triggers
```

**Before implementing any feature or phase, read the relevant docs in `docs/` (canonical) and, for visual rules, `specs/design-system.md`.** Other files in `specs/` are historical (they describe the June ZIP-first prototype) and lose to `docs/` and this file where they disagree. If the docs are missing or incomplete for the task at hand, ask before proceeding.

---

## Local dev
- `npm run dev` (port 3000)
- Or use `preview_start` via the Claude_Preview MCP — config in `.claude/launch.json`
- `npm run build` to typecheck + production build
- `npm test` (Vitest), `npm run typecheck`, `npm run validate:ballots` — CI runs all of these plus lint and build
- `BALLOT_PROVIDER=fixture npm run dev` runs the whole address → ballot flow on fictional data with no credentials (use a full address with city and state or ZIP, e.g. `1 Sample Way, Springfield, CA`; addresses containing `invalid`, `ratelimit`, `nocoverage`, `error`, `ambiguous` simulate failure states)
- Env var names/purposes: `docs/infrastructure/ENVIRONMENT.md`
- Env vars in `.env.local` (gitignored). `.env.example` lists all required vars.

## Deployment
- Vercel auto-deploys from `main` to `ballot-ai.vercel.app`
- Environment variables set in the Vercel dashboard

## Status
Phases 1 (data layer), 2 (landing + routing) and 3 (mobile) are done; 4 (ingestion) and 5 (AI synthesis) follow the Nov 3 refresh. Current work: the November 3, 2026 address-first refresh — status and P0–P3 queue in `docs/elections/2026-11-03/IMPLEMENTATION_PLAN.md`. Open product questions: `docs/product/PRD.md` §25.

---

## When in doubt
1. `git log --oneline -15` — recent commits with detailed messages
2. `docs/product/PRD.md` (decisions, open questions) and `docs/architecture/` — plus the local memory file if you have one
3. **Ask the user before doing anything structural.** Better to confirm than to undo.
