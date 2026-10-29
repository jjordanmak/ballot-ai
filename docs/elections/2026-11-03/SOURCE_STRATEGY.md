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

## 5. Live news sources (nationwide)

`src/data/sources/news.json` lists the approved outlets (owner approval pending). About 160 sources in three scopes:

- **National (26).** Wire services, networks and national papers chosen across the political spectrum, plus election and state-policy specialists that cover down-ballot races (Votebeat, Stateline, Bolts, Ballotpedia News). They can match any tracked contest.
- **State (77).** At least one statewide newsroom for every state and DC. The base is the States Newsroom network and its partners (Texas Tribune, CalMatters, Mississippi Today, VTDigger and others), plus other nonprofit statehouse newsrooms and major papers' politics feeds. A state outlet only matches its own state's contests, and the state name counts as context.
- **Local (56).** Newsrooms in the largest metros plus San Mateo County. They match only their state's contests, and their city or county names count as context.

**Inclusion rule:**
- Original reporting, a public corrections policy, and no ownership or control by a party, campaign, PAC or litigation group.
- Every outlet that meets the rule is treated the same.
- Opinion and sponsored items are held by the automated checks.

**Excluded:**
- CNN and Reuters, which have no maintained public RSS.
- RealClearPolitics, which aggregates other outlets' stories.
- Groups such as Democracy Docket, which is run by a litigation group.

**Fetching:**
- National outlets are fetched every 2 minutes, state outlets every 6 and local outlets every 10.
- A failing feed backs off, doubling each time up to 6 hours.
- Each run stops starting fetches after 80 seconds.

**Feed URLs** follow each outlet's published feed pattern. They couldn't be fetched from the build sandbox, so the collector's first run confirms them (`feed_source_state.last_status`).

**Coverage outside California** begins when someone there looks up a ballot: that registers the contests the collectors track. More county-level outlets are added as usage shows where voters are.

### 5.1 Live polls

Owner decision 2026-10-29: polls come from the poll tables on Wikipedia's election pages as a **stopgap**. The owner may switch to a more official source later.

- **Collector:** `/api/cron/polls`, every 20 minutes (`src/lib/feeds/polls.ts`, parser in `wikiPolls.ts`). For each tracked state-level contest (governor, U.S. Senate and House, statewide offices, statewide measures) it looks up the standard Wikipedia page and parses only pages that changed. A table is used only when its candidate columns are exactly this contest's candidates (or Yes/No for a measure).
- **Approved pollsters:** `src/data/sources/pollsters.json`, 50 academic, media and independent pollsters with public methodology (owner review pending). Firms that mainly poll for parties or campaigns are left out.
- **Automated checks**, no manual queue: the pollster is approved; the row is not marked sponsored or partisan; field dates, sample size and margin of error are all present; and the poll was fielded within 60 days. Anything else is held with a reason. Corrections on Wikipedia update the stored poll.
- **Attribution:** each race's polling card shows the newest live poll with pollster, dates, sample, margin and a link to the release, plus a "Poll list via Wikipedia (CC BY-SA)" credit.

## 6. Fabrication guard

No contest, candidate, or measure is ever added from memory or general knowledge. Every durable row needs a fetched, citable source URL and a verification timestamp.

## 7. Findings from the Daly City reference ballot (2026-10-28)

- **Google Civic / VIP omitted every judicial retention contest** (2 Supreme Court, 11 First District Court of Appeal). `src/lib/ballot/officialRecords.ts` now adds certified retention contests for any California county from the SoS certified list. Each addition is cited and carries a `PROVIDER_GAP` warning.
- **VIP sends statewide contests with the county as "district"** and sends measures as `ballot-measure` with title-only data. The normalizer handles both.
- **Official proposition content comes from the SoS Official Voter Information Guide quick-reference pages**, verbatim (`scripts/lib/parse_ca_vig_qrg.py`).
- **Civic / VIP and the certified lists send candidate names in ALL CAPS.** Readable names come from official proper-case sources: the SoS certified list (statewide, congressional, legislative), the SoS voter guide justices pages (all 64 retention justices, `scripts/lib/gen_ca_justice_names.py`; this also restores accents, e.g. "Rodríguez"), and the Daly City Clerk. Remaining names fall back to `readableName()` in `src/domain/text.ts`. The verbatim ballot name stays on each profile.
- **Official sources confirm 28 races, 48 candidates and 21 measures for the reference ballot** (the county roster and measure list; no contest missing for the address; Jefferson Union High and Jefferson Elementary board seats are "On Ballot: No"). Cross-checks on 2026-10-29:
  - **Vote411** matches all 49 items, but lists Justice Danny Chou under Court of Appeal Division 4. The SoS certified list, the SoS voter guide, the Court of Appeal (appointed to Division Five in 2023, filling Justice Needham's seat), Ballotpedia and Vote.org all say **Division 5**. We keep Division 5; Vote411 most likely has a data-entry error.
  - **Vote.org / Ballotpedia** add four Coastside contests (Coastside County Water District Zone 5, Coastside Fire Protection District D and E, Granada Community Services District) with 10 candidates, and omit the Regional Transit Measure. Ballotpedia marks those contests as estimated from geographic boundaries ("may not appear on your official ballot"). They serve the Half Moon Bay coast, not Daly City, and neither the county data (via Google) nor Vote411 nor CalMatters lists them. This explains the owner's earlier 32 / 58 / 20 count (28 + 4 races, 48 + 10 candidates, 21 − 1 measures).
  - **CalMatters** matches all 49 items.
  - Vote411 and CalMatters label the transit measure "RTM". The county's measure list, impartial analysis and argument forms all say "Regional Transit Measure", which we keep.
- **Google Civic only matches home addresses in the county's voter street data** (tested 2026-10-29 with public locations). Daly City City Hall (a public building), intersections ("90th St & Sullivan Ave", "Mission St & John Daly Blvd", "corner of …"), a street with no number, a city alone, and a city plus ZIP all return HTTP 200 with zero contests, which we report as NO_COVERAGE. Voters registered by cross streets or a description can't be resolved through Civic; the NO_COVERAGE message now says so and points them to their county. Unit numbers don't matter: the street data is by house number, and every unit at an address shares its districts.
- **Civic never reports an address as ambiguous; it silently picks a best guess** (tested 2026-10-29 with public addresses): "100 Main St, CA" became Los Angeles and "1 Main St" became Dallas, TX. Our AMBIGUOUS_ADDRESS status therefore only appears from the fixture provider today. The ballot page names the matched city in its header so a wrong guess is visible.
