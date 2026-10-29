# ballot.ai

A live, source-grounded voter guide. Every race and candidate on a voter's ballot, compared side by side, with live news and polls from approved public sources.

Built with Next.js 16, React 19, Tailwind v4, and Supabase.

---

## What it does

**Enter your address. Get your ballot. Understand every choice.**

Given a residential address, ballot.ai resolves the exact ballot for that address and shows:

- Every contest that applies: federal, statewide, legislative, judicial (including retention), county, city, school and special districts
- Every candidate exactly as named on the ballot, with party or designation and "vote for N"
- Every ballot measure: statewide propositions (stored once) and local measures
- Where each fact came from: official source, conduit, and retrieval time on every contest
- Distinct, honest states when data is partial or unavailable. A provider failure is never shown as "nothing on your ballot".
- Live news from approved outlets' RSS feeds and live polls from Wikipedia's poll tables (approved pollsters only), matched to the contests on the ballot and pushed to open pages as they publish. A "Where to vote" link on every ballot.

Candidate profiles (platform, background, past positions, relevant experience, track record, priorities, stances, timeline, notable facts, endorsements, campaign funding, news) come next, each item cited. See `docs/product/PRD.md` §11.5.

ballot.ai is politically neutral: no endorsements, rankings, predictions, or recommendations. The address is used once for the lookup and never stored, logged, or sent to AI tools (`docs/architecture/PRIVACY.md`).

The June 2, 2026 CA primary prototype (ZIP-based, hand-researched) is a deprecated internal snapshot at `/archive/ca-2026-primary/94015`: it works locally and on previews and returns 404 in production.

**Docs:** `docs/product/PRD.md` · `docs/architecture/` · `docs/infrastructure/ENVIRONMENT.md` · `docs/elections/2026-11-03/`

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env.local and fill in keys
cp .env.example .env.local

# 3. Run the dev server
npm run dev
```

Visit [localhost:3000](http://localhost:3000).

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router | SSR + Server Components for fast first paint |
| UI | React 19 | Server / client component split |
| Styling | Tailwind CSS v4 | Custom utilities + design-token CSS vars |
| Type system | TypeScript strict | Catches schema drift between DB and UI |
| Database | Supabase (Postgres) | Realtime + Row-Level Security + free tier |
| Realtime | Supabase Realtime (Broadcast) | Pushes new feed items to open pages, one channel per page |
| Hosting | Vercel | Auto-deploys from `main`, preview URLs per PR |
| Cron | Vercel Cron | News collection (every 2 min), daily retraction and link check, polls (every 20 min) |
| News & polls | Approved outlets' RSS/Atom feeds (`src/data/sources/news.json`); Wikipedia poll tables (`src/data/sources/pollsters.json`) | No API keys; automated checks, no manual queue |
| Ballot data | Google Civic Information API v2 (behind a provider interface) | Address → contests; VIP-fed official data |
| Photos | Provider photo URL when supplied, else initials | No photo resolver yet |
| Drag & drop | `@dnd-kit` | Accessible, lightweight |
| Icons | `lucide-react` | Tree-shakeable |
| Fonts | IBM Plex Serif / Sans / Mono | Editorial display + technical accents |

---

## Project structure

See the annotated tree in `CLAUDE.md` ("Where things live"). In short: `src/domain/` (provider-independent types), `src/lib/providers/` (Google Civic + fixture), `src/lib/ballot/` (resolve / load / validate), `src/app/` (landing, `/ballot/[electionSlug]/[ballotKey]`, `/archive/…`), `scripts/` (validation, QA, deprecated snapshot), `supabase/migrations/`.

---

## Environment variables

Names, purpose, and exposure for every variable: `docs/infrastructure/ENVIRONMENT.md` (never commit values). Minimum for local dev: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `GOOGLE_CIVIC_API_KEY` (server-only). Or run `BALLOT_PROVIDER=fixture npm run dev` with no credentials at all.

---

## Deployment

Pushes to `main` deploy to production via Vercel. Pull requests get preview URLs automatically.

Set the same env vars in **Vercel → Settings → Environment Variables** before the first deploy.

---

## Roadmap

- [x] **Phase 0–2** — prototype, Supabase data layer, landing + routing (June 2026 primary)
- [x] **Phase 3** — mobile responsive
- [ ] **Nov 3, 2026 refresh** — address-first, Google Civic provider, national Tier 0 coverage, Daly City reference ballot. Plan: `docs/elections/2026-11-03/IMPLEMENTATION_PLAN.md`
- [ ] **Phase 4** — source ingestion: live news and polls done; photos and official records next
- [ ] **Phase 5** — offline AI synthesis with per-item citations
