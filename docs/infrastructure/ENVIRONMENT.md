# Environment & Configuration

> **Never put values in this file.** Names, purpose, and exposure only.

## 1. Variables

| Variable | Purpose | Exposure | Dev | Preview | Prod | Status |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | client + server (public) | ✓ | ✓ | ✓ | existing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key, read-only under RLS | client + server (public) | ✓ | ✓ | ✓ | existing |
| `SUPABASE_SERVICE_ROLE_KEY` | Writes `ballot_resolutions`/`resolution_events`; seeds | **server only** | ✓ (seed) | ✓ | ✓ | existing · rotation candidate |
| `GOOGLE_CIVIC_API_KEY` | Google Civic Information API v2 | **server only**. Never `NEXT_PUBLIC_` | ✓ | ✓ | ✓ | **new, required** |
| `GOOGLE_CIVIC_ELECTION_ID` | Optional override of the discovered election ID | server only | opt | opt | opt | new, optional |
| `BALLOT_PROVIDER` | `google-civic` (default) or `fixture` (UI dev/tests) | server only | opt | opt | ✗ (do not set) | new |
| `BALLOT_QA_ADDRESS_94015` | Private Daly City QA address, used only by `scripts/qa-resolve.ts` | **local/cloud dev only. Never Vercel, never CI** | ✓ | ✗ | ✗ | new, private |
| `GOOGLE_MAPS_API_KEY` | Places Autocomplete (P2, deferred) | client key restricted by HTTP referrer + Places API | — | — | — | future |
| `ANTHROPIC_API_KEY` | Offline enrichment (P2) | **server/scripts only** | opt | ✗ | P2 | future |
| `ANTHROPIC_DEFAULT_MODEL` / `ANTHROPIC_EXTRACTION_MODEL` | Model overrides ([AI_ARCHITECTURE](../architecture/AI_ARCHITECTURE.md) §4) | server only | opt | opt | opt | future |
| `GNEWS_API_KEY`, `NEWSDATA_API_KEY` | News ingestion (spec only, unused) | server only | — | — | — | unused |
| `CRON_SECRET` | Protects future `/api/cron/*` routes | server only | — | — | — | future |

## 2. Where to set them

- **Local:** `.env.local` (gitignored). `.env.example` lists the names.
- **Claude Code cloud environment:** session title bar → environment → **Edit**. Add these as environment variables or secrets. A **new session** picks up changes.
- **Vercel:** Project `ballot-ai` → Settings → Environment Variables. Scope each variable to Development, Preview, and Production as in the table. Tooling received a 403 when listing variables on 2026-10-28, so **the owner must audit the current list manually**.

## 3. Credential audit and rotation (no values inspected)

| Credential | Finding | Action |
|---|---|---|
| Supabase service-role key | In use since May 2026 (local seeding, possibly Vercel). It is used for a public-triggered write in `resolveZip` | Rotate **after** the new deploy is verified. Update Vercel and `.env.local` |
| Supabase anon key | Public by design | No action |
| Google Civic key | Does not exist yet | Create it restricted to *Google Civic Information API* only. Set a quota alert. Request a quota increase before Nov 1 |
| Anthropic key | Not in use by the app | If one exists from an earlier experiment, revoke it until P2 |
| GNews / NewsData keys | Not used by code | Revoke if issued |
| Committed secrets | None found (`.env*` ignored, `.env.example` empty) | — |

## 4. Runtime

- Node: Vercel project set to **24.x**, local is 22. Add `"engines": { "node": ">=22" }` to `package.json`.
- Framework: Next.js 16 (Vercel framework preset `nextjs`). There is no `vercel.json` and no cron jobs.
- Vercel deployment protection: SSO on previews ("all except custom domains"). Production on `ballot-ai.vercel.app` is public.

## 5. Dependency audit (2026-10-28)

| Package | Current | Category | Note |
|---|---|---|---|
| `next` | ^16.2.4 | SAFE NOW (patch/minor only) | Stay on 16.x through the election |
| `react` / `react-dom` | ^19 | AFTER ELECTION | — |
| `@supabase/supabase-js` | ^2.105 | SAFE NOW (minor) | — |
| `server-only` | missing | **REQUIRED NOW** | Add explicitly |
| `vitest` | missing | **REQUIRED NOW** (dev) | Test runner |
| `typescript` | ^5 | AFTER ELECTION | — |
| `tailwindcss` | ^4 | AFTER ELECTION | — |
| `eslint` 9 / `eslint-config-next` 16 | — | AFTER ELECTION | — |
| `@anthropic-ai/sdk` | absent | P2 | Add when the enrichment pipeline lands |

Run `npm audit --omit=dev` after install. Fix only high or critical advisories in the runtime dependency graph before Nov 3.
