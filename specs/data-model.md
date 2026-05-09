# Data model spec

## Conventions
- **DB**: snake_case. **TS**: camelCase. Conversion happens only in `src/lib/db/getBallot.ts` — nowhere else.
- JSONB is used for fields that are arrays of structured objects (intro, history, voteForIf, etc.) — write-once, read-many, no join table needed.
- `current_role` is a Postgres reserved word — the DB column is `current_position`. TS uses `currentRole`. The mapper translates.
- Primary keys for elections/races/candidates are human-readable text slugs (e.g. `ca-2026-primary`, `governor`, `becerra`). UUIDs for supporting tables.

---

## Schema overview

```
elections
  └── races (election_id)
        ├── candidates (race_id)
        │     ├── endorsements (candidate_id)
        │     └── news_items (candidate_id) ← also race-level
        └── polls (race_id)

jurisdictions (zip → districts JSON)

sources
  └── source_evidence_links (source_id → target)

material_events → synthesis_runs → synthesized_field_versions
```

---

## Tables

### `elections`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | e.g. `ca-2026-primary` |
| `state` | text | `CA` |
| `date` | date | `2026-06-02` |
| `name` | text | Full display name |
| `type` | text | `primary` \| `general` \| `special` |

### `jurisdictions`
| Column | Type | Notes |
|---|---|---|
| `zip` | text PK | |
| `districts` | jsonb | `{ state, county, us_house, state_assembly, state_senate, boe, supervisor, city }` |
| `city`, `county`, `state` | text | Denormalized for fast display |

ZIP → district resolution uses the US Census Bureau geocoder, then caches the result here for subsequent requests.

### `races`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | e.g. `governor` |
| `election_id` | text FK | |
| `scope_type` | text | `statewide` \| `district` \| `county` |
| `scope_value` | text | District code, e.g. `CA-15`, `AD-19`, `BOE-2`; null when statewide |
| `intro` | jsonb | `{ context, whyItMatters, bigPicture, whatsAtStake, polling, pollingSourceUrl?, pollingSourceLabel?, suspendedNote? }` |
| `issues` | jsonb | `[{ id, label, fallback? }]` |
| `meta` | jsonb | `[{ label, value }]` — term length, salary, etc. |

A race is on a voter's ballot when:
- `scope_type = statewide` → always
- `scope_type = district` → `scope_value` matches a district code in `jurisdictions.districts`
- `scope_type = county` → `scope_value` matches the county code

### `candidates`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | e.g. `becerra` (un-namespaced for UI use) |
| `race_id` | text FK | |
| `major` | boolean | Shown in comparison table by default (when > 5 active candidates) |
| `polling_status` | text | Display string: "Frontrunner", "Trailing", "Suspended", etc. |
| `polling_pct` | numeric(5,2) | For the visual bar — null if unknown |
| `trend` | text | `up` \| `down` \| `flat` |
| `campaign_suspended` | jsonb | `{ date, note }` or null |
| `withdrawn` | boolean | Formally withdrawn (hidden from ballot view, kept in DB) |
| `current_position` | text | DB name for `currentRole` in TS |
| `background` | text | 2–4 sentences; may contain `<mark>` tags |
| `bottom_line` | text | 1–2 sentence synthesis |
| `priorities`, `stances`, `strengths`, `criticisms` | jsonb | `string[]` — each item may contain `<mark>` |
| `history` | jsonb | `[{ year, event }]` — most recent first |
| `vote_for_if` | jsonb | `string[]` |
| `issues` | jsonb | `{ [issueId]: { stance, source? } }` |

### `endorsements`
| Column | Type | Notes |
|---|---|---|
| `candidate_id` | text FK | |
| `category` | text | `Elected Officials` \| `Unions` \| `Advocacy & Industry` \| `Local Leaders` \| `Newspapers & Media` |
| `name` | text | |
| `sort_order` | int | |

### `news_items`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Stable ID from ingestion source |
| `race_id` | text FK | null for candidate-level items |
| `candidate_id` | text FK | null for race-level items |
| `type` | text | `news` \| `social` \| `poll` \| `endorsement` |
| `social` | jsonb | `{ platform, handle, avatar?, media?, poll?, likes?, reposts?, replies?, isReel? }` |

### `polls`
| Column | Type | Notes |
|---|---|---|
| `race_id` | text FK | |
| `results` | jsonb | `[{ candidate_id, pct }]` |

---

## Phase 4/5 tables (migration `0003`)

### `sources`
Ingested pages with provenance metadata.

| Column | Notes |
|---|---|
| `source_type` | `official` \| `campaign` \| `news` \| `rss` \| `api` \| `social` \| `polling` \| `civic` \| `other` |
| `trust_tier` | `official` \| `verified` \| `standard` \| `limited` |
| `url` | Unique — deduplication key |
| `raw_hash` | Hash of fetched content — detects changes |
| `status` | `active` \| `stale` \| `retracted` \| `blocked` \| `error` |

### `source_evidence_links`
Maps a source to a specific field of a specific candidate/race.

| Column | Notes |
|---|---|
| `target_type` | `race` \| `candidate` \| `issue` \| `endorsement` \| `poll` \| `news_item` |
| `target_id` | FK to the target row |
| `field_name` | Which field this source supports, e.g. `background`, `stances` |
| `claim` | Optional short description of what the source supports |

### `material_events`
Detected triggers for re-synthesis.

| Column | Notes |
|---|---|
| `event_type` | `campaign_suspension` \| `withdrawal` \| `stance_change` \| `endorsement` \| `poll_shift` \| `major_news` \| `official_filing` \| `correction` \| `other` |
| `severity` | `low` \| `medium` \| `high` |
| `status` | `queued` \| `reviewing` \| `accepted` \| `ignored` \| `processed` |

### `synthesis_runs`
Job queue for AI synthesis.

| Column | Notes |
|---|---|
| `target_type` / `target_id` / `field_name` | Which field is being synthesized |
| `trigger_type` | `manual` \| `scheduled` \| `material_event` \| `seed` |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `discarded` |
| `model` / `prompt_version` | Audit trail |

### `synthesized_field_versions`
Versioned output history.

| Column | Notes |
|---|---|
| `is_current` | Unique index on `(target_type, target_id, field_name)` where `is_current` — only one active version per field |
| `content` | The synthesized text, may contain `<mark>` tags |

**RLS**: `synthesis_runs`, `material_events`, and `synthesized_field_versions` are internal — RLS enabled with no public policies. Anon clients can read `sources` and `source_evidence_links` only.

---

## Realtime publications
Tables subscribed for live push to clients:
- `news_items` — feeds the news carousel
- `polls` — feeds polling cards
- `races`, `candidates`, `endorsements` — trigger the UpdateBar (migration `0002`)
