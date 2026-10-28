# Data Model

> The legacy schema (June primary) is described in [`specs/data-model.md`](../../specs/data-model.md) and is kept as-is for the archive.
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
                  provider, retrievedAt, expiresAt, warnings: Warning[], ballotKey? }
ResolutionStatus 'SUCCESS' | 'PARTIAL' | 'INVALID_ADDRESS' | 'AMBIGUOUS_ADDRESS'
               | 'ELECTION_NOT_FOUND' | 'NO_COVERAGE' | 'RATE_LIMITED' | 'PROVIDER_ERROR'
CoarseLocation  { city?, state?, county? }      // never street or house number
```

## 3. Tables added in 0004 (additive; nothing dropped)

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `elections` (altered) | Add `slug` (unique), `status` (`upcoming/active/archived`), `scope_ocd_id`, `external_ids jsonb`, `is_archived` | | public read |
| `divisions` | Political geography | `key` PK (OCD ID, or `{scope}:{id}:{name-slug}` when OCD is unavailable), `ocd_id`, `name`, `scope`, `parent_key`, `state`, `county`, `metadata` | public read |
| `contests` | **Durable, verified** contests | `id uuid`, `election_id`, `division_key`, `kind`, `contest_type`, `title`, `ballot_title`, `number_elected`, `vote_for`, `partisan`, `special`, `ballot_order`, `provider_ids jsonb`, `verified_at`, `verification_source_id → sources`, unique `(election_id, division_key, normalized_title)` | public read |
| `contest_candidates` | Ballot listing (not profiles) | `id uuid`, `contest_id`, `ballot_name`, `party`, `designation`, `incumbent`, `order_on_ballot`, `campaign_url`, `provider_ids`, `legacy_candidate_id → candidates` (nullable link to rich profile) | public read |
| `measures` | Measure stored **once** | `id uuid`, `election_id`, `division_key`, `identifier`, `title`, `official_url`, `summary`, `passage_threshold`, `full_text_url`, `analysis_url`, unique `(election_id, division_key, identifier)` | public read |
| `contest_measures` | Contest ↔ measure link | `contest_id`, `measure_id` | public read |
| `provider_records` | Normalization debugging / reconciliation | `provider`, `entity_type`, `entity_id`, `external_id`, `payload_hash`, `normalizer_version`, `fetched_at` | service only |
| `manual_overrides` | Audited corrections | `entity_type`, `entity_id`, `field`, `original_value`, `corrected_value`, `reason`, `source_id → sources`, `created_by`, `created_at`, `active` | public read of active rows (transparency); writes service only |
| `ballot_resolutions` | **Provider cache**, geography-keyed | `ballot_key` PK, `election_id`, `provider`, `status`, `ballot jsonb` (normalized, address-free), `location jsonb` (coarse), `retrieved_at`, `expires_at` | service only (read via server) |
| `resolution_events` | Privacy-safe metrics | `id`, `occurred_at`, `provider`, `status`, `latency_ms`, `contest_count`, `state`, `warning_codes text[]`, `cache_hit` | service only |
| `sources` (altered) | Extend `source_type` with `provider`, `official_voter_guide`, `election_authority` | | public read |

The legacy `races`/`candidates`/`endorsements`/`news_items`/`polls` tables are untouched. `contest_candidates.legacy_candidate_id` lets a durable ballot listing reuse rich archived profiles where a person appears again.

## 4. Identity and matching

- **Division key:** the OCD ID when known. Otherwise a provider-scoped descriptor (`congressional:15:california's 15th congressional district`). Normalization lowercases, trims, and collapses whitespace.
- **Contest match key:** `(election_id, division_key, normalize(title))`. A fallback match on `(election_id, normalize(title))` is flagged as a warning.
- **Measure dedupe:** `(election_id, division_key, normalize(identifier ?? title))`. Statewide propositions match once for every ballot.
- **Candidate match:** within a contest, `normalize(ballotName)`. The official ballot name is always displayed verbatim.

## 5. Provenance rules

- Every durable row references at least one `sources` row (`verification_source_id`, or `source_evidence_links`).
- Precedence follows the PRD §12 source priority. A conflicting lower-priority value is stored in `provider_records` or reported, and is never written over a higher-priority value.
- `manual_overrides` are applied at read time on top of provider and durable values, so the original value is always recoverable.
- AI output lives only in `synthesized_field_versions` (0003) and is rendered with an "AI-generated summary" label and its `source_ids`.
