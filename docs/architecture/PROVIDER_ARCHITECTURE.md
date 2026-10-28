# Provider Architecture

> Domain types: [DATA_MODEL](./DATA_MODEL.md) · Privacy constraints: [PRIVACY](./PRIVACY.md)

## 1. Interfaces (`src/lib/providers/types.ts`)

```ts
interface ElectionProvider {
  readonly id: ProviderId;
  getElections(): Promise<ProviderResult<ProviderElection[]>>;
}

interface BallotResolver {
  readonly id: ProviderId;
  resolveBallot(address: AddressInput, election: ElectionRef): Promise<ResolvedBallot>;
}

// Capability-oriented: a provider implements only what it can do.
interface CandidateEnricher { enrichCandidate(c: CandidateChoice, ctx): Promise<Enrichment | null> }
interface MeasureEnricher   { enrichMeasure(m: Measure, ctx): Promise<Enrichment | null> }
interface ContestVerifier   { verifyContests(b: ResolvedBallot): Promise<VerificationReport> }
```

`AddressInput` is an opaque branded string (`{ readonly raw: string }`). It has a custom `toJSON()` and `toString()` that return `"[redacted address]"`, so it cannot leak through logging or serialization by accident.

## 2. P0 implementations

| Provider | Capability | Status |
|---|---|---|
| `GoogleCivicElectionProvider` | `ElectionProvider`, via `GET /civicinfo/v2/elections` | P0 |
| `GoogleCivicBallotResolver` | `BallotResolver`, via `GET /civicinfo/v2/voterinfo?address&electionId&returnAllAvailableData` | P0 |
| `FixtureBallotResolver` | `BallotResolver` from synthetic fixtures (`BALLOT_PROVIDER=fixture`) | P0, for tests and UI development |
| `CompositeBallotResolver` | Tries resolvers in order and merges results by contest match key | P0 stub (one child) |
| `DurableRecordsMerger` | Applies `contests`/`measures`/`manual_overrides` from Supabase | P0 |
| `CaliforniaSecretaryOfStateProvider`, `CountyElectionProvider`, `OfficialVoterGuideProvider`, `CandidateOfficialSiteProvider` | Enrichers and verifiers | P1–P2 (manual or curated first) |
| `VIPBulkBallotResolver`, `StateElectionBallotResolver` | `BallotResolver` | P3 (planned, not built) |

## 3. Google Civic Information API v2

The API was checked against Google's discovery document (revision 20261028) on 2026-10-28.

- **Endpoints used:** `elections.electionQuery` (`/elections`) and `elections.voterInfoQuery` (`/voterinfo`). `divisionsByAddress` exists and is a P1 option for OCD IDs. The Representatives API was retired in 2025 and is not used.
- **`voterinfo` params:**
  - `address` (required in practice)
  - `electionId`
  - `officialOnly` (default false)
  - `returnAllAvailableData` (true, so partial info returns with a success code when matching is incomplete; the result is surfaced as `PARTIAL`)
  - `productionDataOnly` is not used (internal or partner only)
- **Election ID:** discovered by matching `electionDay === '2026-11-03'` and an `ocdDivisionId` covering the US. The expected ID is `12000`, but it is **never hardcoded**. `GOOGLE_CIVIC_ELECTION_ID` can override it, and the override is validated against `/elections` at startup of the QA scripts.
- **Contest fields mapped:**
  - Contest-level: `type`, `office`, `ballotTitle`, `level[]`, `roles[]`, `district{name,scope,id}`, `numberElected`, `numberVotingFor`, `ballotPlacement`, `primaryParties`, `special`, `electorateSpecifications`, `sources[{name,official}]`
  - Candidates: `name`, `party`, `orderOnBallot`, `candidateUrl`, `photoUrl`, `channels`
  - Referendum: `referendumTitle`, `referendumSubtitle`, `referendumBrief`, `referendumText`, `referendumUrl`, `referendumBallotResponses`, `referendumPassageThreshold`, `referendumEffectOfAbstain`, `referendumProStatement`, `referendumConStatement`
- `district.id` is **relative to scope**, not an OCD ID. The division key is therefore `{scope}:{id}:{name}` unless an OCD ID is obtained separately.
- **Response metadata not persisted:** `normalizedInput` (it is an address), polling and drop-off locations (address-adjacent, P2 feature), and `precinctId` (kept in memory only, used as a ballot-key input but never stored in raw form).

### Error mapping

| Upstream | `ResolutionStatus` |
|---|---|
| 200 with contests | `SUCCESS` (or `PARTIAL` if warnings indicate incompleteness, e.g. `returnAllAvailableData` partial, or contests without choices) |
| 200, zero contests, election known | `NO_COVERAGE` (never "empty ballot") plus a warning |
| 400 `parseError` / `invalidAddress` / address could not be geocoded | `INVALID_ADDRESS` |
| 400 multiple matches / ambiguous | `AMBIGUOUS_ADDRESS` |
| 400 `electionUnknown` / election not in `/elections` | `ELECTION_NOT_FOUND` |
| 404 no data for address | `NO_COVERAGE` |
| 429 / `rateLimitExceeded` / `dailyLimitExceeded` | `RATE_LIMITED` |
| 5xx, timeout, network, unexpected shape | `PROVIDER_ERROR` |

Exact upstream `reason` strings are confirmed during live QA. Unknown reasons map to `PROVIDER_ERROR`, and the raw reason (never the address) is logged.

### Transport

- Server-only `fetch`, 8s timeout, one retry on 5xx or timeout with jitter, and no retry on 4xx.
- The key travels as a query param per the API's conventions. It is never logged, and request URLs are redacted in logs.
- **Caching:** the provider response is not cached by URL (the URL contains the address). Instead the normalized, address-free ballot is cached in `ballot_resolutions` by geography key. TTL = `min(Cache-Control max-age, 24h)`, defaulting to 6h when no header is present. Google's API terms must be re-reviewed by the owner before extending the TTL ([PRIVACY](./PRIVACY.md) §5).

## 4. Normalization (`google-civic/normalize.ts`)

A pure function: `(VoterInfoResponse, ElectionRef, now) → ResolvedBallot` (address-free).

1. `type === 'Referendum'` → `kind: 'measure'`, with a `Measure` built from the referendum fields.
2. `type` matching /retention/i → `contestType: 'retention'`. Candidates appear as the ballot choices (Yes/No when `referendumBallotResponses` is present).
3. `numberElected` and `numberVotingFor` are parsed as integers. Invalid values produce a `null` plus a `NUMBER_PARSE` warning.
4. **Category derivation** comes from `district.scope` + `roles` + `level`:
   - `national`/`congressional` → federal
   - `statewide` → statewide, or judicial if roles include judge
   - `stateUpper`/`stateLower` → state_legislature
   - `judicial` → judicial
   - `countywide`/`countyCouncil` → county
   - `citywide`/`cityCouncil`/`ward`/`township` → city
   - `schoolBoard` or role `schoolBoard` → education
   - `special` → special_district
   - measures → measures
   - otherwise → other, plus a warning
5. **Dedupe:** contests by match key and candidates by normalized name within a contest. Duplicates produce warnings, not silent drops.
6. **Ordering:** `ballotPlacement` then provider order, and `orderOnBallot` for candidates.
7. `sources` from the contest. `official: true` is retained per source.
8. Raw provider types are preserved in `contest.raw.type` for debugging, and unknown values never throw.

## 5. Validators (`src/lib/ballot/validate.ts`)

Each validator emits a `Warning { code, severity, contestId? }`:

- `ZERO_CONTESTS`
- `DUPLICATE_CONTEST`
- `DUPLICATE_CANDIDATE`
- `CONTEST_WITHOUT_CHOICES`
- `MEASURE_WITHOUT_TITLE`
- `MISSING_SOURCE`
- `NAME_CONFLICT` (durable vs provider)
- `STALE_ELECTION`
- `ELECTION_DATE_MISMATCH`
- `MISSING_JURISDICTION`
- `UNSUPPORTED_CONTEST_TYPE`
- `NUMBER_PARSE`
- `SOURCE_CONFLICT`
- `PROVIDER_SHAPE_CHANGE` (unexpected top-level keys or missing required keys)

`scripts/validate-ballot.ts` runs them over fixtures and live QA output, and produces JSON plus Markdown.
