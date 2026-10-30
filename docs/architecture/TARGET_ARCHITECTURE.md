# Target Architecture

> Product requirements: [PRD](../product/PRD.md). Current state: [CURRENT_ARCHITECTURE](./CURRENT_ARCHITECTURE.md).
> Deep dives: [DATA_MODEL](./DATA_MODEL.md) · [PROVIDER_ARCHITECTURE](./PROVIDER_ARCHITECTURE.md) · [AI_ARCHITECTURE](./AI_ARCHITECTURE.md) · [PRIVACY](./PRIVACY.md) · [MIGRATION_PLAN](./MIGRATION_PLAN.md)

## 1. Core rule

**Own the domain model, not the raw election-data pipeline.** The UI and business logic depend only on ballot.ai's domain types. Provider response shapes stop at the adapter boundary.

```
                ┌──────────────────────────── server only ─────────────────────────────┐
 Address form ─►│ server action ─► BallotService.resolve(address, election)            │
 (address never │                    │                                                 │
  leaves server)│                    ├─► ElectionProvider  (which election?)            │
                │                    ├─► BallotResolver    (GoogleCivic → Composite later)
                │                    │      └─ provider client (HTTP, retries, cache)  │
                │                    │      └─ normalize()  → domain ResolvedBallot     │
                │                    ├─► DurableRecords.merge()  (official contests,   │
                │                    │      measures, sources, manual overrides)        │
                │                    ├─► Enrichment lookup (stored, never generated     │
                │                    │      on page load)                               │
                │                    ├─► Validators (zero contests, duplicates, …)      │
                │                    ├─► Metrics (privacy-safe)                         │
                │                    └─► ballot_resolutions (geography key, TTL)        │
                └───────────────┬──────────────────────────────────────────────────────┘
                                ▼
          redirect /ballot/{electionSlug}/{ballotKey}   (no address in URL)
                                ▼
          Ballot page (RSC) reads ballot_resolutions + enrichment → UI components
```

Offline, as a separate pipeline:

```
Official docs / sources ─► extraction (Claude where useful) ─► schema + provenance validation
   ─► sources / synthesized_field_versions / contests / measures ─► served by ballot page
```

## 2. Layers and directories

| Layer | Path | Depends on | Notes |
|---|---|---|---|
| Domain | `src/domain/` | nothing | Pure TS types plus small pure helpers (categorize, ballot key). No I/O |
| Providers | `src/lib/providers/` | domain | Interfaces + `google-civic/` (client, types, normalize, resolver) + `fixture/` |
| Durable records | `src/lib/ballot/durable.ts` | domain, supabase | Registers stable `divisions`/`contests`/`contest_candidates` ids (insert-if-missing, then read ids). The old archive fetchers in `src/lib/db/` are removed |
| Application service | `src/lib/ballot/` | providers, db, domain | `resolveBallot`, `loadBallot`, status → copy mapping |
| Observability | `src/lib/observability/` | — | Redacting logger + `resolution_events` writer |
| Feeds | `src/lib/feeds/` | domain, supabase | News collection (RSS/Atom), polls from Wikipedia tables, matcher, automated checks, retraction recheck, X-link discovery. Runs only from `/api/cron/*`; never sees an address |
| AI (P2) | `src/lib/ai/` | domain | Central model config. Offline pipeline only |
| UI | `src/app/`, `src/components/` | domain, application service | Never imports providers |

## 3. Key decisions

1. **Address-first.** The landing page accepts a full residential address. ZIP is not a step.
2. **Google Civic is the P0 runtime resolver** (`/elections` + `/voterinfo`), behind `BallotResolver`. VIP stays upstream. There is no parallel VIP query per request.
3. **No address persistence.** The resolved ballot is stored under `ballotKey = sha256(electionId | sorted district descriptors)`. Many households share that key, and it carries a TTL. See [PRIVACY](./PRIVACY.md).
4. **Provider cache ≠ durable records.** The provider response cache is `ballot_resolutions` with a TTL that honors `Cache-Control` and is capped at 24h. Durable records (`contests`, `measures`, `sources`, `manual_overrides`) hold *officially verified* data with provenance and survive across cache expirations.
5. **Durable merge.** Provider contests are matched to durable records by election plus normalized district plus normalized title. The official source wins for display. Conflicts are recorded, never silently resolved.
6. **Graceful degradation.** Every `ResolvedBallot` carries a `status` and `warnings[]`. The UI renders a distinct state for each status. An upstream failure never renders as an empty ballot.
7. **Elections are data.** The `elections` table carries a slug, status, and provider external IDs. The Civic election ID is discovered by date via `/elections`. An optional `GOOGLE_CIVIC_ELECTION_ID` overrides it.
8. **AI off the hot path.** Page loads never call an LLM. See [AI_ARCHITECTURE](./AI_ARCHITECTURE.md).
9. **Archive, don't delete.** The June primary is a deprecated internal snapshot: `/archive/{electionId}/{zip}` renders from a committed JSON file (`src/data/deprecated/2026-06-02-ca-primary.json`), never the database. It 404s in production and works locally and on previews. Nothing links to it.
10. **Live content.** Vercel Cron runs collectors (`/api/cron/news` every 2 minutes, `/api/cron/news-apis` every 2 minutes (news found by search: the NYT Article Search API by candidate name, statewide, federal and legislative candidates only; GDELT for vetted outlets whose pages we can't read, one search per race, statewide first, attaching a story to a candidate only when its headline names them, and pausing 10 minutes to 2 hours after any refusal; same checks, stored under the outlet, and an outlet's own feed later supplies its headline and summary), `/api/cron/news-recheck` daily, `/api/cron/qa-counties` every 5 minutes until done (a one-time sweep of one synthetic address per county, built from Census address ranges, results in `qa_runs`; the national test list's daily cron was removed), `/api/cron/polls` every 20 minutes). The news matcher runs 3 independent checks per story (owner, 2026-10-30). **Race:** the race itself is the subject (a race phrase such as "governor's race" or "District 8 candidates" in the headline or summary, 2 of its candidates in the headline, a poll headline naming the office, or race phrases repeated in the story and in its lead); only then is it on the race's own feed (`race_ids`). **Person:** the story is about the candidate, not a passing mention. It must be clearly the same person (office, place, opponent or state nearby), and then named in the headline or summary, given a Q&A block, or quoted or reported acting ("Becerra said"). Anything else goes to an AI check (`src/lib/feeds/about.ts`: Haiku, at most 12 a run, within the monthly AI budget) that must copy a sentence from the story reporting what they said or did, accepted only if code finds it word for word next to their name. **Measure:** its identifier plus its jurisdiction. It tries the headline and feed summary first, then the article's own text: the feed's full text when present, else the page, read once politely (robots.txt, the research job's per-site spacing) within a per-run cap; the text is never stored (`feed_article_reads` keeps only the URL). News items and polls matched to durable contests and candidates that pass the automated checks publish to `feed_items` with no manual step; held items are kept only for audit. Stories belong to an election from its `elections.cycle_start` (Nov 3, 2026: Nov 6, 2024, the day after the last general election); a story from before the election year must also be about the campaign. The page's first render reads the newest 25 published items per contest and type (`ballot_feed()`), and each carousel loads 25 older ones at a time as it nears its end (`feed_page()`, its own cursor per race or candidate); after that, a database trigger broadcasts each newly published item on a Realtime Broadcast topic per election and state (`feed:{election}:{ST}`), and each ballot page opens one channel and filters by contest id client-side. There is no Update button on the November page.
11. **Rendering.** The landing page is static or ISR. The ballot page is dynamic RSC reading from Supabase (fast single-row read). Provider calls happen only inside the server action.

## 4. Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | RSC + server action | Address form. Resolves the ballot and redirects |
| `/ballot/[electionSlug]/[ballotKey]` | RSC, `noindex` | Renders a stored resolution. Expired → re-enter address |
| `/archive/[electionId]/[zip]` | RSC | Deprecated June 2026 primary snapshot. Internal only: 404 in production |
| `/ballot/[zip]/[electionId]` (legacy) | redirect | When the first segment is 5 digits: → `/` in production, → `/archive/[electionId]/[zip]` elsewhere |
| `/api/address/suggest`, `/api/address/place` | route handlers | Places API (New) proxy for address suggestions. Refuses requests that are neither `Sec-Fetch-Site: same-origin` nor a matching `Origin`. Monthly quota in `api_usage` |
| `/api/cron/news`, `/api/cron/news-recheck`, `/api/cron/polls` | route handlers, `CRON_SECRET` bearer | Collect news; retract dead links and find X links daily; collect polls. Vercel runs crons on production deployments only |

## 5. Scaling path

- **Daly City → California → US** uses the same code path. Scaling consists of QA, durable official records for priority jurisdictions, and normalization fixes. It does not add new resolvers.
- **Future providers** plug in behind `CompositeBallotResolver([directFeed, state, googleCivicFallback])` without UI changes.
- **Quota:** every new address lookup costs one Civic `voterinfo` call. The geography-keyed cache serves page loads, reloads, and shared links without calling Google, but it can't skip the lookup for a new address, because the geography isn't known until Google answers. Request a quota increase before peak traffic, and watch `RATE_LIMITED` in `resolution_events`.

## 6. Non-functional

- **Security:** provider keys are server-only (never `NEXT_PUBLIC_*`). The service-role client is created lazily and used only on the server (server actions, route handlers, and scripts). URLs from data are validated (`http(s)` only) before rendering.
- **Observability:** `resolution_events` (status, provider, latency, contest count, state, warning codes) plus structured logs with address redaction.
- **Testing:** Vitest unit tests on normalization, status mapping, and validators against synthetic fixtures. Validation scripts produce JSON and Markdown reports. CI runs lint, typecheck (app and `scripts/`), test, `validate:ballots`, and build on Node 24.
