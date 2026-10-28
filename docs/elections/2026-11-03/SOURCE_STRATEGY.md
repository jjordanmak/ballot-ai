# Source Strategy: November 3, 2026

> Priority order: [PRD §12](../../product/PRD.md#12-election-data-strategy) · Provider details: [PROVIDER_ARCHITECTURE](../../architecture/PROVIDER_ARCHITECTURE.md)

## 1. Runtime

- **Google Civic Information API v2** resolves every address nationwide (`/elections` → election ID by date; `/voterinfo` → contests).
- Google aggregates official state feeds via the Voting Information Project. Each contest's `sources[].official` flag is preserved.

## 2. Verification sources (Daly City reference ballot)

| Level | Authoritative source | Used for |
|---|---|---|
| State | California Secretary of State: certified list of candidates, Official Voter Information Guide (statewide propositions: number, title, summary, analysis, arguments) | Statewide contests, propositions, judicial retention (Supreme Court / Court of Appeal) |
| County | San Mateo County Assessor-County Clerk-Recorder & Elections (smcacre.gov): sample ballot by address, candidate list, county and local measures | Every county, city, school, and special-district contest, local measures |
| City | City of Daly City Clerk: municipal candidates, city measures | City contests |
| Districts | School districts (for example Jefferson Elementary / Jefferson Union High / Bayshore Elementary, depending on address) and special districts. **Assignment is verified from the county sample ballot, not inferred from ZIP** | Education and special districts |

Rules:
1. **Do not assume all of 94015 shares a ballot.** Verification is per resolved ballot.
2. A contest that appears in the official county sample ballot but **not** in Civic is reported as a provider gap. It may be added as a durable official record with its source.
3. A contest in Civic but not in the official sample ballot is flagged as a discrepancy and never silently removed.
4. Name differences (Civic vs. official) are recorded as `NAME_CONFLICT`. The official spelling is displayed.

## 3. Statewide measures

Statewide propositions are stored once in `measures` (`division_key = ocd-division/country:us/state:ca`), with the SoS voter guide as source. They are attached to every CA ballot by identifier match.

## 4. National baseline

For states outside California, Civic data is shown with its own `sources`. There is no enrichment beyond what Civic supplies. Every ballot links to the state or county election office (from Civic `state[].electionAdministrationBody` when present).

## 5. Fabrication guard

No contest, candidate, or measure is ever added from memory or general knowledge. Every durable row needs a fetched, citable source URL and a verification timestamp.

## 6. Findings from the Daly City reference ballot (2026-10-28)

- **Google Civic / VIP omitted every judicial retention contest** (2 Supreme Court, 11 First District Court of Appeal). `src/lib/ballot/officialRecords.ts` now adds certified retention contests for any California county from the SoS certified list. Each addition is cited and carries a `PROVIDER_GAP` warning.
- **VIP sends statewide contests with the county as "district"** and sends measures as `ballot-measure` with title-only data. The normalizer handles both.
- **Official proposition content comes from the SoS Official Voter Information Guide quick-reference pages**, verbatim (`scripts/lib/parse_ca_vig_qrg.py`).
- **Civic / VIP and the certified lists send candidate names in ALL CAPS.** Readable names come from official proper-case sources: the SoS certified list (statewide, congressional, legislative), the SoS voter guide justices pages (all 64 retention justices, `scripts/lib/gen_ca_justice_names.py`; this also restores accents, e.g. "Rodríguez"), and the Daly City Clerk. Remaining names fall back to `readableName()` in `src/domain/text.ts`. The verbatim ballot name stays on each profile.
- **The owner's own sample ballot lists 32 races, 58 candidates and 20 measures**; Civic plus retention gives 28, 48 and 21. The gap (about 4 local contests with 10 candidates, plus 1 measure) cannot be identified without the San Mateo County sample ballot (`smcacre.gov`, blocked by this session's network policy).
