# QA Plan: November 3, 2026

> Sources: [SOURCE_STRATEGY](./SOURCE_STRATEGY.md) · Privacy: [PRIVACY](../../architecture/PRIVACY.md)

## 1. Automated (CI, every push)

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Unit tests on synthetic Civic fixtures cover:
  - candidate, primary, and general contests;
  - retention;
  - referendum (statewide + local);
  - `numberElected` > 1 and invalid values;
  - unknown contest type and unknown district scope;
  - duplicate contest and duplicate candidate;
  - contest with zero candidates;
  - 400/404/429/5xx/timeout status mapping;
  - ballot-key stability and order independence;
  - address redaction (logger + `AddressInput`).
- Validator suite on all committed fixtures.

## 2. Daly City reference ballot (P0)

**Input:** `BALLOT_QA_ADDRESS_94015` (env only).

**Command:**

```bash
npm run qa:resolve -- --env BALLOT_QA_ADDRESS_94015 --label daly-city
```

**Outputs:**
- `fixtures/ballots/2026-11-03/daly-city.normalized.json` (address-free)
- `reports/2026-11-03/daly-city-qa.json`
- `reports/2026-11-03/daly-city-qa.md`

**Manual verification:** every contest, choice, and measure is checked against the San Mateo County sample ballot for the same address, plus the CA SoS voter guide. Each item is recorded as verified, discrepancy, or unverified, with its source URL.

**Acceptance criteria** (from the brief):

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Address lookup succeeds | status `SUCCESS` |
| 2 | Correct Nov 3 election selected | `election.date === 2026-11-03`; ID discovered via `/elections` |
| 3 | Every applicable contest displays | Count matches the official sample ballot |
| 4 | Every valid choice displays | Per-contest name match |
| 5–8 | Local, judicial/retention, education, and special-district contests display | Category coverage vs. the official ballot |
| 9–10 | Statewide propositions + local measures | Identifier match vs. the SoS and SMC lists |
| 11 | Vote-for-N | `voteFor` rendered and matching official |
| 12 | Source provenance | Every contest has ≥ 1 source |
| 13 | Official names preserved | No normalization of display names |
| 14 | Missing enrichment never hides choices | UI test with zero enrichment |
| 15 | Provider failure ≠ empty ballot | Status-page UI tests |
| 16 | No address persisted | DB check: no address-like strings in `ballot_resolutions`. Logs grep |
| 17 | Automated tests exist | CI green |

## 3. California coverage (P1)

About 12 counties chosen for geographic and administrative diversity (for example Los Angeles, San Diego, Orange, Alameda, San Francisco, Sacramento, Fresno, Kern, Riverside, Humboldt, Imperial, Alpine).

- Inputs are **public government-building addresses** (county registrar or administration offices), never private residences.
- Report per county: resolution status, contest count by category, measure count, choiceless contests, unsupported types, and warnings.

## 4. National (P1)

One public address per state + DC (state capitol building). Report columns:

- lookup status;
- election resolved;
- contests parsed;
- measures;
- unusual types;
- provider errors;
- schema issues.

**One address does not prove state coverage.** The report states this explicitly.

## 5. Browser verification (P0)

Playwright against `npm run dev` with `BALLOT_PROVIDER=fixture`, at desktop (1440) and mobile (390) widths:

- landing renders and the form submits;
- ballot renders every category, vote-for-N, and measures;
- every status page;
- expired key;
- archive redirect;
- `noindex` header present.
