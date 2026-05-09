# ballot.ai — instructions for AI assistants

This file auto-loads in every Codex session in this repo. **Read it fully before doing any work.**

> **Keep in sync with `CLAUDE.md`** (the Claude Code counterpart). Any time you update one, update the other. The files share all project rules; only the tool/environment-specific lines differ.

For deeper context (decisions, history, open questions): check the last 10–15 git commits (`git log --oneline -15`) — they have rich notes.

---

## What this is
A live, source-grounded voter guide. Given a ZIP and an election, it shows every race + candidate on the voter's ballot, profiled in depth, with live news feeds. Goal: nationally scalable, fully data-driven.

## Stack
Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript strict · Supabase Postgres (with RLS + Realtime) · Vercel · IBM Plex serif/sans/mono. Brand is **`ballot.ai`** (lowercase `b`).

---

## Hard rules — do NOT violate

### Brand & copy
- The product name is **`ballot.ai`** (lowercase `b`). Not "Ballot.ai", not "Ballotwise", not "Voterly".
- Slogan: **"a guide to your ballot"**. Not "your live sample ballot".
- Tab titles: landing = `ballot.ai • your voting guide`; ballot = `ballot.ai • your voting guide for [ZIP]`.

### Color discipline (this is load-bearing)
- **Yellow accent** (`--color-accent`, golden ~`oklch(80% 0.155 82)`): ONLY for `<mark>` highlights and small UI accents (icons in section eyebrows, hover states, the polling rail). NEVER as a tinted background on cards/tables/profiles.
- **Red and blue**: reserved EXCLUSIVELY for Republican / Democratic party encoding. Never use them for status, errors, links, or anything else.
- **Trend-down** uses `--color-trend-down` (a muted red, distinct from rep red).
- **Backgrounds**: chroma is pulled to ~0.003 so cards/tables/profiles read as honest gray, not yellow-tinted. If you reach for a yellow-tinted bg, that's wrong.
- **Supplementary tints** (orange / green / teal / purple / pink): allowed for data encoding (key-section pillars, endorsement categories) but never as primary surface bg.

### Highlights (`<mark>`)
- Solid-fill bar (no gradient) with rounded corners. Already styled in `globals.css`.
- Auto-highlight algorithm in `src/components/Highlight.tsx` runs at render. Manual `<mark>` tags pass through. Don't disable it without a reason.
- For Phase 4 synthesis: the LLM prompt should wrap 2–3 load-bearing phrases per text field in `<mark>`.

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

### Other rules
- DB column was renamed `current_role` → `current_position` (Postgres reserved word). TS still uses `currentRole`; the mapper in `src/lib/db/getBallot.ts` translates.
- The Update button is **Realtime-driven**: disabled until a row changes in `candidates`/`races`/`endorsements`/`polls`. Don't make it always-clickable.
- News updates push via Supabase Realtime separately — don't use the Update button for news.
- Suspended candidates render with a red status pill, NOT yellow/orange.

---

## Behavioral expectations

1. **Pause before every task and state your plan.** Before any implementation, describe what you're going to do, which files you'll touch, and flag any ambiguity in the spec. Stop and report if the spec is missing or contradictory — don't guess.
2. **Verify in browser before claiming done.** Start the dev server (`npm run dev`) and load the page to confirm any visible change works correctly before reporting it done.
2. **Don't add features the user didn't ask for.** A bug fix doesn't need surrounding cleanup. A small UI change doesn't need a refactor.
3. **Check the memory file + recent commits before structural changes.** If you're about to undo something, check git log first — there's probably a reason it's that way.
4. **Match existing conventions** — colors via CSS variables (`var(--color-X)`), components co-located in `src/components/`, data fetchers in `src/lib/db/`.
5. **Ask before changing the design system.** If a request implies "use a different color" or "change the spacing rhythm", confirm before doing it.

---

## Where things live

```
src/
├── app/
│   ├── page.tsx                       Landing (ZIP picker)
│   ├── ballot/[zip]/[electionId]/page.tsx   Ballot view
│   ├── api/zip/[zip]/route.ts         ZIP → jurisdiction lookup
│   ├── layout.tsx                     Root metadata, fonts
│   └── globals.css                    Design tokens, mark styles, animations
├── components/                        UI components (one per concern)
├── data/                              Seed-data TS files (governor, scaffolds, county) — being phased out as Supabase fills in
└── lib/
    ├── db/                            Server-side fetchers (getBallot, getElection, getJurisdiction, resolveZip)
    └── supabase/                      Typed clients (server/browser/admin) + DB types
supabase/
└── migrations/                        SQL migrations
scripts/
└── seed.ts                            Seeds Supabase from TS data files (`npm run seed`)
specs/                                 Feature specs, design system, data model, phase plans
├── product.md                         Vision, target user, brand, non-goals
├── design-system.md                   Full palette, typography, highlight system, sticky patterns
├── data-model.md                      All DB tables, JSONB shapes, TS conventions, Realtime setup
├── ballot-view.md                     Sidebar, comparison table, candidate profiles, news feed
├── phase-3-mobile.md                  Mobile responsive spec + definition of done
├── phase-4-ingestion.md               News cron, photo resolver, source ingestion
└── phase-5-synthesis.md               Perplexity/Claude pipeline, output schema, triggers
```

**Before implementing any feature or phase, read the relevant spec in `specs/`.** Specs are the authoritative source for requirements and design decisions — they take precedence over assumptions. If a spec is missing or incomplete for the task at hand, stop and flag it rather than guessing.

---

## Local dev
- `npm run dev` (port 3000)
- Preview config (Claude Code only): `.claude/launch.json`
- `npm run seed` to (re)populate Supabase from the TS data files
- `npm run build` to typecheck + production build
- Env vars in `.env.local` (gitignored). `.env.example` lists all required vars.

## Deployment
- Vercel auto-deploys from `main` to `ballot-ai.vercel.app`
- Environment variables set in the Vercel dashboard

## Status
Current phase status and the `[NEXT]` queue are in the memory file (`project_ballot_ai.md`). Phases 1 + 2 are done; Phases 3 (data ingestion), 4 (AI synthesis), and 5 (mobile responsive) are open. **There's an unresolved product question on candidate-coverage rules** — see memory.

---

## When in doubt
1. `git log --oneline -15` — recent commits with detailed messages
2. Memory file — decisions, rationale, open questions
3. **Ask the user before doing anything structural.** Better to confirm than to undo.
