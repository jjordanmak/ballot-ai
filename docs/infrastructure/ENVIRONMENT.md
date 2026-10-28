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
| `GOOGLE_PLACES_API_KEY` | Address suggestions via Places API (New), called from `/api/address/*` | **server only**. Never `NEXT_PUBLIC_`. Restrict the key to Places API (New). Cap usage with a daily quota and a billing budget alert | opt | ✓ | ✓ | **new, optional** (without it the form still works; it just shows no suggestions) |
| `PLACES_AUTOCOMPLETE_MONTHLY_LIMIT` / `PLACES_DETAILS_MONTHLY_LIMIT` | Monthly caps on Places calls, counted in Supabase `api_usage` (`src/lib/usage/quota.ts`). Default **10000** each, Google's free monthly amount. Only calls through our server are counted, so keep the key server-only; Google's per-day quotas (`AutocompletePlacesRequest per day`, `GetPlaceRequest per day`) set to 322 are a second, Google-enforced guard. Raise them to allow paid usage; `0` turns that call off. When a cap is reached, suggestions stop until the next month (Pacific time) and typing still works | server only | opt | opt | opt | new, optional |
| `ANTHROPIC_API_KEY` | Offline enrichment (P2) | **server/scripts only** | opt | ✗ | P2 | future |
| `ANTHROPIC_DEFAULT_MODEL` / `ANTHROPIC_EXTRACTION_MODEL` | Model overrides ([AI_ARCHITECTURE](../architecture/AI_ARCHITECTURE.md) §4) | server only | opt | opt | opt | future |
| `GNEWS_API_KEY`, `NEWSDATA_API_KEY` | News ingestion (spec only, unused) | server only | — | — | — | unused |
| `CRON_SECRET` | Protects future `/api/cron/*` routes | server only | — | — | — | future |

## 2. Where to set them

- **Local:** `.env.local` (gitignored). `.env.example` lists the names.
- **Claude Code cloud environment:** session title bar → environment → **Edit**. Add these under **Environment variables**, not Network secrets, because the code reads each value by name while it runs. Use the legacy `anon` key until §3.1. A **new session** picks up changes.
- **Vercel:** Project `ballot-ai` → Settings → Environment Variables. Scope each variable to Development, Preview, and Production as in the table. Tooling received a 403 when listing variables on 2026-10-28, so **the owner must audit the current list manually**.

## 3. Credential audit and rotation (no values inspected)

| Credential | Finding | Action |
|---|---|---|
| Supabase service-role key | In use since May 2026 (local seeding, possibly Vercel). It powered the public-triggered write in `resolveZip`, which has since been removed | Replace with an `sb_secret_` key after the election (§3.1) |
| Supabase anon key (legacy JWT) | Public by design. Used by the live site, previews, and the cloud environment | Keep through Nov 3, then replace with an `sb_publishable_` key (§3.1) |
| Google Civic key | Created 2026-10-28 as `ballot-ai-civic-server`, restricted to *Google Civic Information API* only | Set a quota alert. Request a quota increase before peak traffic |
| Anthropic key | Not in use by the app | If one exists from an earlier experiment, revoke it until P2 |
| GNews / NewsData keys | Not used by code | Revoke if issued |
| Committed secrets | None found (`.env*` ignored, `.env.example` empty) | — |

### 3.1 Post-election: move to Supabase's new API keys

**When:** after Nov 3 results are certified and traffic has dropped, not during election week. Changing keys on every surface at once is exactly the kind of change to avoid while voters are using the site.

**Why:**
- The legacy `anon` and `service_role` keys are tied to the project's JWT secret. Replacing either one means rotating that secret, which invalidates both keys everywhere at the same moment.
- The new `sb_publishable_` and `sb_secret_` keys can each be revoked and replaced on their own, with no shared-secret rotation.
- Supabase recommends the new keys for current apps.
- Separately, the service-role key has been in use since May 2026 and is due for rotation anyway. This swap does both jobs.

**Steps:**
1. **Create the new keys.** In Supabase → Project Settings → API Keys, create or confirm a publishable key and create a secret key (for example `ballot-ai-server`).
2. **Point the app at them.** No code change is needed: the Supabase client accepts the new keys in place of the legacy ones.
   - Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the `sb_publishable_…` value.
   - Set `SUPABASE_SERVICE_ROLE_KEY` to the `sb_secret_…` value.
   - Optionally rename the variables to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` in the same change, updating `src/lib/supabase/*.ts`, `scripts/seed.ts`, `.env.example` and this table.
3. **Update every surface:**
   - Vercel (Development, Preview, Production)
   - The Claude Code cloud environment
   - Each developer's `.env.local`
4. **Verify:**
   - Deploy a preview.
   - Check that an address lookup saves a ballot (this exercises the secret key) and that the ballot page loads.
   - Check the archive page and Realtime news (these exercise the publishable key).
   - Run `npm run seed` against a non-production target, if one exists.
5. **Promote, then retire the old keys.** Promote to production and confirm it's healthy. Then disable the legacy `anon` and `service_role` keys in Supabase (Project Settings → API Keys → Legacy API keys). Disabling is reversible, so keep them disabled for a week before treating the switch as final.
6. **Record it.** Note the date in this table.

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
