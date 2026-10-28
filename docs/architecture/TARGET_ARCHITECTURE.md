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
| Durable records | `src/lib/db/` | domain, supabase | New fetchers for contests/measures/sources/overrides. The existing archive fetchers stay |
| Application service | `src/lib/ballot/` | providers, db, domain | `resolveBallot`, `loadBallot`, status → copy mapping |
| Observability | `src/lib/observability/` | — | Redacting logger + `resolution_events` writer |
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
9. **Archive, don't delete.** The June primary experience moves to `/archive/{electionId}/{zip}` on the existing tables and components.
10. **Rendering.** The landing page is static or ISR. The ballot page is dynamic RSC reading from Supabase (fast single-row read). Provider calls happen only inside the server action.

## 4. Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | RSC + server action | Address form. Resolves the ballot and redirects |
| `/ballot/[electionSlug]/[ballotKey]` | RSC, `noindex` | Renders a stored resolution. Expired → re-enter address |
| `/archive/[electionId]/[zip]` | RSC | June 2026 primary prototype (existing UI) |
| `/ballot/[zip]/[electionId]` (legacy) | redirect | → `/archive/[electionId]/[zip]` when the first segment is 5 digits |
| `/api/zip/[zip]` | **removed from UI** | Kept temporarily, scheduled for removal ([MIGRATION_PLAN](./MIGRATION_PLAN.md)) |

## 5. Scaling path

- **Daly City → California → US** uses the same code path. Scaling consists of QA, durable official records for priority jurisdictions, and normalization fixes. It does not add new resolvers.
- **Future providers** plug in behind `CompositeBallotResolver([directFeed, state, googleCivicFallback])` without UI changes.
- **Quota:** every new address lookup costs one Civic `voterinfo` call. The geography-keyed cache serves page loads, reloads, and shared links without calling Google, but it can't skip the lookup for a new address, because the geography isn't known until Google answers. Request a quota increase before peak traffic, and watch `RATE_LIMITED` in `resolution_events`.

## 6. Non-functional

- **Security:** provider keys are server-only (never `NEXT_PUBLIC_*`). The service-role client is created lazily and used only in server actions and scripts. URLs from data are validated (`http(s)` only) before rendering.
- **Observability:** `resolution_events` (status, provider, latency, contest count, state, warning codes) plus structured logs with address redaction.
- **Testing:** Vitest unit tests on normalization, status mapping, and validators against synthetic fixtures. Validation scripts produce JSON and Markdown reports. CI runs lint, typecheck, test, and build.
