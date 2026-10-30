# Data Model

> The legacy schema (June primary) is described in [`specs/data-model.md`](../../specs/data-model.md). Its rows are kept intact, but nothing reads them at runtime: the deprecated June pages render from a committed snapshot (`src/data/deprecated/2026-06-02-ca-primary.json`).
> This document defines the **durable ballot.ai domain model** added in migration `0004_address_first_domain.sql`.

## 1. Principle

The stable abstraction is: **given location X and election Y, these contests apply.** Provider ballot styles and precinct IDs are metadata, not core entities. Divisions are an open type and never a fixed enum of US jurisdictions.

## 2. Domain types (TypeScript, `src/domain/`)

```ts
Election        { id, slug, name, date, type, scopeOcdId?, status, externalIds: Record<provider, id> }
Division        { key, ocdId?, name, scope (open string), level?, state?, county? }
Contest         { id, kind: 'candidate' | 'measure', contestType: ContestType, title, ballotTitle?,
                  division: Division, numberElected?, voteFor?, partisan?, primaryParties?, special,
                  ballotOrder?, electorateSpecifications?, choices: CandidateChoice[], measure?: Measure,
                  sources: SourceRef[], verification?: Verification, category: ContestCategory }
ContestType     'general' | 'primary' | 'runoff' | 'retention' | 'referendum' | 'other'   (raw value kept)
ContestCategory 'federal' | 'statewide' | 'state_legislature' | 'judicial' | 'county' | 'city'
              | 'education' | 'special_district' | 'measures' | 'other'               (derived)
CandidateChoice { id, ballotName (verbatim), party?, designation?, incumbent?, orderOnBallot?,
                  urls: { campaign?, photo?, channels[] }, sources: SourceRef[], enrichment?: CandidateEnrichment }
Measure         { id, identifier? ('Proposition 50', 'Measure A'), title, subtitle?, brief?, text?, url?,
                  responses[], passageThreshold?, effectOfAbstain?, proStatement?, conStatement?, sources[] }
SourceRef       { provider, name, url?, official: boolean, retrievedAt, verifiedAt? }
Provenance      'official' | 'source_derived' | 'ai_generated'
ResolvedBallot  { status: ResolutionStatus, election?, contests: Contest[], location: CoarseLocation,
                  districts?: DistrictRef[], districtDescriptors?: string[],
                  administration?: ElectionAdministration, mailOnly?: boolean,
                  provider, retrievedAt, expiresAt, warnings: Warning[], statusDetail?, ballotKey? }
ResolutionStatus 'SUCCESS' | 'PARTIAL' | 'INVALID_ADDRESS' | 'AMBIGUOUS_ADDRESS'
               | 'ELECTION_NOT_FOUND' | 'NO_COVERAGE' | 'RATE_LIMITED' | 'PROVIDER_ERROR'
CoarseLocation  { city?, state?, county?, zip? }   // never street or house number; ZIP is coarse
DistrictRef     { kind: 'congressional' | 'state_lower' | 'state_upper' | 'board_of_equalization',
                  number, ocdId? }                  // display only, e.g. "CA-15", "AD-19", "XX-AL"
ElectionAdministration { name?, regionName?, electionInfoUrl?, ballotInfoUrl?,
                  votingLocationFinderUrl?, voterLookupUrl? }
```

## 3. Tables added in 0004 (additive; nothing dropped)

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `elections` (altered) | Add `slug` (unique), `status` (`upcoming/active/archived`, plus `deprecated` from 0009: internal-only, never offered or resolved; the June 2026 CA primary row), `scope_ocd_id`, `external_ids jsonb`, `is_archived` | | public read |
| `divisions` | Political geography | `key` PK (state OCD ID for statewide contests, otherwise `{st}:{scope}:{id}:{normalized name}`; see §4), `ocd_id`, `name`, `scope`, `parent_key`, `state`, `county`, `metadata` | public read |
| `contests` | **Durable, verified** contests | `id uuid`, `election_id`, `division_key`, `kind`, `contest_type`, `title`, `ballot_title`, `number_elected`, `vote_for`, `partisan`, `special`, `ballot_order`, `provider_ids jsonb`, `verified_at`, `verification_source_id → sources`, unique `(election_id, division_key, normalized_title)` | public read |
| `contest_candidates` | Ballot listing (not profiles) | `id uuid`, `contest_id`, `ballot_name`, `party`, `designation`, `incumbent`, `order_on_ballot`, `campaign_url`, `provider_ids`, `legacy_candidate_id → candidates` (nullable link to rich profile) | public read |
| `measures` | Measure stored **once** | `id uuid`, `election_id`, `division_key`, `identifier`, `title`, `official_url`, `summary`, `passage_threshold`, `full_text_url`, `analysis_url`, unique `(election_id, division_key, identifier)` | public read |
| `contest_measures` | Contest ↔ measure link | `contest_id`, `measure_id` | public read |
| `provider_records` | Normalization debugging / reconciliation | `provider`, `entity_type`, `entity_id`, `external_id`, `payload_hash`, `normalizer_version`, `fetched_at` | service only |
| `manual_overrides` | Audited corrections | `entity_type`, `entity_id`, `field`, `original_value`, `corrected_value`, `reason`, `source_id → sources`, `created_by`, `created_at`, `active` | public read of active rows (transparency); writes service only |
| `ballot_resolutions` | **Provider cache**, geography-keyed | `ballot_key` PK, `election_id`, `provider`, `status`, `ballot jsonb` (normalized, address-free), `location jsonb` (coarse), `retrieved_at`, `expires_at` | service only (read via server) |
| `resolution_events` | Privacy-safe metrics | `id`, `occurred_at`, `provider`, `status`, `latency_ms`, `contest_count`, `state`, `warning_codes text[]`, `cache_hit` | service only |
| `api_usage` (0007) | Monthly cap on paid API calls (Google Places) | (`period` e.g. `2026-11` in Pacific time, `metric` e.g. `places.autocomplete`) PK, `count`, `updated_at`; incremented only through `consume_api_quota(period, metric, limit)`, which refuses at the limit | service only |
| `feed_items` (0008, applied 2026-10-29) | Live page content (news and polls today; endorsements, stances, events later) | `id`, `election_id`, `type`, `source_key`, `publisher`, `title`, `excerpt`, `url` (unique, canonical), `image_url`, `published_at`, `ingested_at`, `status` (`published/held/removed`), `held_reason`, `contest_ids uuid[]`, `candidate_ids uuid[]` (→ `contests` / `contest_candidates`), `match jsonb` (why it matched), `payload jsonb` (poll numbers, …), `updated_at`. **Not** in the `postgres_changes` publication; pages hear changes through Broadcast (below) | public read of `published` rows only; held/removed rows and writes service only |
| `feed_item_checks` (0008) | Retraction-check bookkeeping, kept apart so checks never notify open pages | `item_id` PK → `feed_items`, `checked_at`, `last_status` | service only |
| `qa_runs` (0015) | National test list results, one row per location per daily run. Address-free | `run_id`, `run_at`, `label`, `state`, `status`, `contest_count`, `categories`, `warnings`, `inventory` (race titles, district names, candidate names and party labels as the provider sent them), `error` | service only |
| `feed_article_reads` (0014) | Which article pages the news collector has read for matching, so none is read twice. Never the article's text | `url` PK, `read_at`, `outcome` (`read/robots/busy/blocked/error/empty`), `matched`; rows older than 30 days deleted daily | service only |
| `feed_source_state` (0008) | Per-source fetch state for conditional GETs and dead-feed spotting | `source_key` PK, `etag`, `last_modified`, `last_fetched_at`, `last_status`, `last_error`, `failures` (consecutive, for backoff), `items_seen` | service only |
| `candidate_links` (0008) | X accounts found on a candidate's own campaign site by the link check | `contest_candidate_id → contest_candidates`, `kind` (`campaign/x`), `url`, `verified_from` (the page it was found on), `checked_at`, unique (`contest_candidate_id`, `kind`) | public read; writes service only |
| `candidate_link_checks` (0008) | When each campaign site was last checked | `contest_candidate_id` PK, `checked_at`, `found` | service only |
| `ballot_feed(election_id, contest_ids, per_contest = 12)` (0008) | First-load read: newest N published items per contest, so a busy statewide race can't crowd out local contests | `security invoker` (RLS applies); executable by `anon` | — |
| `feed_items_broadcast` trigger (0008) | Sends each newly published item, a published item's visible change, or a removal to Realtime Broadcast topic `feed:{election}:{ST}`, once per state of the contests it is about. Held items are never sent | `security definer`; not callable through the API | — |
| `contest_candidates.display_name` (0008) | Readable name (the ballot may print a name in all caps) used by the news matcher | | public read |
| `sources` (altered) | Extend `source_type` with `provider`, `official_voter_guide`, `election_authority` | | public read |

The legacy `races`/`candidates`/`endorsements`/`news_items`/`polls` tables are untouched (no longer read by the app). `contest_candidates.legacy_candidate_id` lets a durable ballot listing reuse rich archived profiles where a person appears again.

## 4. Identity and matching

- **Division key:** the state's OCD ID for statewide contests (`ocd-division/country:us/state:ca`; DC is `ocd-division/country:us/district:dc`). Otherwise a provider-scoped descriptor prefixed with the lowercase state code, because district names repeat across states (`tx:statelower:12:state house district 12`). Normalization lowercases, trims, and collapses whitespace. Durable registration (`src/lib/ballot/durable.ts`) fills `divisions.state` from the key.
- **Durable registration:** insert-if-missing, then read the ids back (shared statewide rows are never rewritten per lookup). Batches are de-duplicated, and contests that share a division and title are told apart by their candidates' names.
- **Contest match key:** `(election_id, division_key, normalize(title))`. A fallback match on `(election_id, normalize(title))` is flagged as a warning.
- **Measure dedupe:** `(election_id, division_key, normalize(identifier ?? title))`. Statewide propositions match once for every ballot.
- **Candidate match:** within a contest, `normalize(ballotName)`. The official ballot name is always displayed verbatim.

## 5. Provenance rules

- Every durable row references at least one `sources` row (`verification_source_id`, or `source_evidence_links`).
- Precedence follows the PRD §12 source priority. A conflicting lower-priority value is stored in `provider_records` or reported, and is never written over a higher-priority value.
- `manual_overrides` are applied at read time on top of provider and durable values, so the original value is always recoverable.
- AI output lives only in `synthesized_field_versions` (0003) and is rendered with an "AI-generated summary" label and its `source_ids`.
