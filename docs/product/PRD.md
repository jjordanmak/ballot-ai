# ballot.ai — Product Requirements Document

> **Canonical PRD.** Supersedes `specs/product.md` as the product source of truth. `specs/` is kept as historical and design detail, and its still-valid decisions are carried forward here.
> Last updated: 2026-10-28 · Owner: product (jjordanmak)
> Technical detail lives in [`docs/architecture/`](../architecture/). This document describes the product, not the code.

---

## 1. Executive summary

ballot.ai helps a voter understand exactly what is on **their** ballot.

**Enter your address. Get your ballot. Understand every choice.**

Given a residential address and an election, ballot.ai shows every contest, candidate and measure that applies to that address. It explains each office and each measure in plain language, presents documented, sourced facts about each choice, and always shows where each fact came from. It is politically neutral. It never tells anyone how to vote.

The first product was a June 2026 California primary prototype built around ZIP codes. This PRD defines the durable product. Its first nationally validated election is the **November 3, 2026 General Election**.

## 2. Product vision

A trustworthy, nationwide, always-current civic information layer for every election in the United States. That covers federal, state, local, judicial, school, and special-district contests, and all ballot measures. It is built so that:

- ballot correctness comes from authoritative election data, never from AI;
- every fact is traceable to a source;
- data providers can be swapped or combined without redesigning the product;
- each new election is added as data and configuration, not as new code.

Over time, ballot.ai becomes the place voters go first, the night before an election or weeks before, instead of piecing a picture together from dozens of tabs. (Mission carried forward from `specs/product.md`: *"Replace the experience of frantically Googling candidates the night before an election with a single, trustworthy, comprehensive guide."*)

## 3. Problem

- Voters often don't know every contest on their ballot until it arrives. Down-ballot contests (judges, school boards, water districts, local measures) are the least understood.
- Information is fragmented across county sample ballots, state voter guides, campaign sites, news, and partisan guides.
- ZIP-based tools are imprecise. A single ZIP can span multiple congressional, legislative, city, school, and special districts.
- Many "voter guides" are partisan, or mix opinion with fact without labeling it.
- AI chat tools can hallucinate candidates, contests, or measure wording. In this domain, that is unacceptable.

## 4. Target users

| Segment | Description | Phase |
|---|---|---|
| **Prepared-but-busy voter** (primary) | Not deeply partisan. Wants facts, context, and a fair picture. Willing to spend 20–30 minutes. Currently spends that time across many disconnected sources. *(Carried from the prior spec.)* | Now |
| **Down-ballot-uncertain voter** | Knows the top of the ticket, but not judges, boards, or measures | Now |
| First-time / newly moved voter | Doesn't know their districts | Now |
| Civic educators, librarians, journalists | Need a neutral reference | Later |
| Partners (nonprofits, newsrooms) | Embed or API | Later |

## 5. Jobs to be done

1. *When my ballot is coming, I want to see everything on it, so I'm not surprised.*
2. *When I see an office I don't recognize, I want to know what it does, so I can judge whether it matters to me.*
3. *When I compare candidates, I want documented facts side by side, so I can decide for myself.*
4. *When I read about a measure, I want to know what a yes vote and a no vote each do, in plain language, with the official text one tap away.*
5. *When I see a claim, I want to know where it came from, so I can trust it or check it.*
6. *When the data is incomplete, I want to be told clearly, so I don't assume a contest isn't on my ballot.*

## 6. Product principles

1. **Neutrality.** Inform, never persuade. No rankings, scores, recommendations, or predictions. (§14)
2. **Provenance.** Every fact carries a source. Official data, source-derived facts, and AI-generated explanation are visibly distinct.
3. **Precision.** The ballot is resolved from the full residential address, never from ZIP. Official ballot names are preserved verbatim.
4. **Comprehensibility.** Plain language, grade-8 reading target, progressive disclosure.
5. **Privacy.** A residential address is sensitive. It is used once to resolve the ballot, then discarded. (§15)
6. **Graceful uncertainty.** A missing profile never hides a choice. A provider failure is never shown as "no contests".
7. **Coverage before enrichment.** A correct, complete, bare ballot beats a partial, beautiful one.
8. **Provider independence.** ballot.ai owns its domain model. Google Civic, VIP, states, and counties are interchangeable providers.
9. **Elections are data.** A new election means new data, never a code fork.

## 7. Scope

ballot.ai does the following:
- Address → ballot resolution for supported elections.
- Display of every applicable contest: candidate races, judicial elections and retentions, and measures (state, county, city, district).
- Vote-for-N and contest instructions.
- Office explainers (what the office does).
- Candidate facts: party or ballot designation, incumbency, official links. Then progressively background, experience, and documented positions, all with sources.
- Measure facts: identifier, official title, summary, links to official text and analysis, and arguments for and against as official records.
- Neutral side-by-side comparison of documented positions.
- Source inspection on every fact.
- Election lifecycle: upcoming → active → Election Day → archived.

## 8. Non-goals

*(Carried from the prior spec, plus additions.)*
- Not a voter registration tool. We may link to official registration.
- Not a partisan guide or endorsement engine.
- Not a news publication. We aggregate and attribute; we don't report.
- Not social, community, or comment-driven.
- Not a real-time results tracker, and not an outcome predictor.
- Not a source of official election information. Official sources are authoritative. ballot.ai links to them and defers to them.
- No personalized political inference. We do not profile users' preferences.
- **No accounts, profiles, login, or personalization in the current product.** Preference-based features are reserved for a possible future membership tier (§22).

## 9. Core user journey

```
Address ─► Ballot ─► Contest ─► Candidate / Measure ─► Comparison / Explanation ─► Source verification
```

1. **Address.** "What's your home address?" A single field submits to the ballot.
2. **Ballot.** Election name and date, plus coarse location context (city and state, never the street). Contests are grouped by level.
3. **Contest.** Office or measure, jurisdiction, "Vote for N", and every choice exactly as printed.
4. **Candidate / Measure.** Progressively richer facts, each with a source.
5. **Comparison / Explanation.** Neutral side-by-side comparison of documented positions. AI explanations are labeled as such.
6. **Source verification.** Every block links to its source, with a retrieved or verified date.

## 10. Information architecture

| Surface | Purpose | Public / indexable |
|---|---|---|
| `/` Landing | Address entry, election context | Yes |
| `/ballot/{election}/{ballotKey}` | A resolved ballot. The key identifies a geography, not a person | **No** (noindex) |
| Contest detail (in-page now, deep link later) | One contest | Later, via the geography page |
| Candidate detail | Profile | Later (public, indexable) |
| Measure detail | Measure explainer | Later (public, indexable) |
| `/archive/{election}/…` | Past elections. Today only the deprecated June 2026 primary snapshot, internal only (404 in production, no links); a user-facing archive comes later | **No** (today) |
| About / Methodology / Sources | Trust | Yes (not built yet) |

Contest groups on the ballot page are **Federal, Statewide, State Legislature, Judicial, County, City / Municipal, Education, Special Districts, Ballot Measures, and Other**. They are derived from data, not hardcoded. Unknown types appear under "Other" rather than being dropped.

Navigation: a desktop sidebar and a mobile top nav, with scroll-spy between contests (existing patterns).

## 11. Functional requirements

### 11.1 Address lookup
- FR-A1: Accept a free-text US residential address. Manual entry must always work. Autocomplete is an enhancement (P2).
- FR-A2: Never ask for ZIP first. ZIP alone must never be presented as sufficient to retrieve "your ballot".
- FR-A3: Distinguish the outcomes *invalid address*, *ambiguous address* (offer correction), and *address outside coverage*.

### 11.2 Election selection
- FR-E1: Default to the next upcoming election covering the address. If several elections apply, let the voter choose.
- FR-E2: Elections are configuration and data (date, name, type, provider IDs). Provider election IDs are discovered, never assumed.
- FR-E3: Past elections remain browsable as archives.

### 11.3 Ballot resolution
- FR-R1: Resolution comes only from authoritative election data via the provider layer.
- FR-R2: Outcomes are explicit: `SUCCESS`, `PARTIAL`, `INVALID_ADDRESS`, `AMBIGUOUS_ADDRESS`, `ELECTION_NOT_FOUND`, `NO_COVERAGE`, `RATE_LIMITED`, `PROVIDER_ERROR`.
- FR-R3: **An upstream failure is never rendered as an empty ballot.**

### 11.4 Contests
- FR-C1: Show the title, jurisdiction or district, contest type, number elected, vote-for instructions, partisan status, and special-election status.
- FR-C2: Preserve the official ordering when the provider supplies it.
- FR-C3: Unknown contest types degrade gracefully into the "Other" group.

### 11.5 Candidates
- FR-K1: Show every valid candidate with the **exact ballot name**, and party or ballot designation where applicable.
- FR-K2: Missing enrichment shows "Profile not yet available". The candidate is never hidden.
- FR-K3: Profile tiers: Tier 1 (party, URL, incumbency) → Tier 2 (role, experience, education, bio) → Tier 3 (documented positions, finance, endorsements as factual records).
- FR-K4: **Profile sections** (Tier 2/3; owner, 2026-10-30, `docs/elections/2026-11-03/WRITING_PIPELINE_PLAN.md`). Every candidate in a contest gets the same sections in the same order. **Every item carries a citation**: an inline source marker that opens the supporting excerpt, the source name, URL, and retrieved date. Written prose carries a marker per sentence.
  - **In Brief.** 2–3 cited sentences in the Bottom Line callout, in this order: experience (offices held, with durations code computes from the cited years), track record (the most-cited fact from their record in office), and positioning and platform, attributed to the campaign. Never comparisons with other candidates, strengths or criticisms, "critics say", electability or momentum, "establishment"/"outsider" labels, rankings, or character judgments. Every candidate's In Brief follows the same template.
  - **Background.** Narrative prose (the eyebrow reads "Background", never "Bio"), with notable facts merged in under one rule for everyone, for example "the first Latino to serve as attorney general". There is no separate Notable facts section.
  - **Past positions.** Everything they have done in adult life, newest first, one line per position as `Title (years)` with the district written out in full: elected and appointed offices, paid jobs, private practice, business roles, board seats, military service, and nonprofit roles. Chairs get their own line; committee memberships go on a line under their position. Education is a short code-written list underneath Background. Users draw their own conclusions from this list, so the product never states "experience gaps".
  - **Key priorities** | **Key stances.** Two columns of short noun phrases in the candidate's own framing (no "Says…" in front, no topic label in front), cited per item; each column's ⓘ tooltip does the attribution.
  - **Endorsements.** In the slot Key Strengths and Key Criticisms used to hold, as 2 rows of 2: Elected Officials | Unions, then Advocacy & Industry | Local Leaders. Only confirmed, cited, named endorsements (no "soft" endorsements, no unnamed "leadership").
  - **Might fit if you….** Exactly 4 lines, each a voter priority that matches one of the candidate's own cited positions ("…want the state to keep Medi-Cal coverage for undocumented adults"), on the 4 issues the candidate emphasizes most in their own materials, each a different issue. Drawn only from the candidate's stated platform and issue stances: never experience, identity, party, demographics, electability or other candidates. Each line starts "…want", "…support", "…oppose" or "…prefer"; no "vote for", "should", "best", party names or identity terms; never highlighted; every candidate in a race has the same count (fewer documented positions show what exists plus the Limited line). Its ⓘ reads: "These lines pair this candidate's own stated positions with priorities a voter might hold. They cover the four issues the candidate emphasizes most in their own materials. ballot.ai does not recommend or rank candidates."
  - **Timeline.** Offices, past elections and results, key decisions and track-record events, and this election (debates, primary result, Nov 3), a citation per event.
  - **Campaign funding.** All available funding information, not just top donors, each figure with an as-of date:
    - totals: raised, spent, and cash on hand;
    - breakdown by source type: individuals (itemized and unitemized), PACs and committees, party, self-funding and loans, small-dollar share, and in-state vs. out-of-state where reported;
    - **the full itemized contributor list** (searchable and paginated), plus independent expenditures supporting and opposing.

    Sources: the state campaign-finance system (CA: Cal-Access / SoS Power Search) and the FEC for federal contests. Gaps in the filings are stated as "not reported".
  - **In the news.** Kept (Tier 3 feed). Every item links to its publisher.
  - Where documentation is thin, the section says "Limited documented information in reviewed sources". It never pads.

### 11.6 Measures
- FR-M1: Show the identifier, official title, jurisdiction, and official source link.
- FR-M2: Enrichment: official summary, ballot question, full text link, impartial and fiscal analysis, arguments for and against (attributed), and approval threshold.
- FR-M3: A statewide measure exists once and is referenced from every applicable ballot.

### 11.7 Sources
- FR-S1: Every displayed fact links to a source with provider, URL, official or non-official status, and retrieved or verified date.
- FR-S2: Conflicts between sources are recorded and surfaced internally. The higher-priority official source wins for display.

### 11.8 AI explanations
- FR-AI1: AI generates only labeled explanations and summaries from stored sources, never ballot facts. (§13)
- FR-AI2: Every AI synthesis lists its supporting sources.

### 11.9 Comparisons
- FR-CMP1: Side-by-side documented positions with sources. Ordering is official ballot order or user-reordered, never ranked.

### 11.10 Error states
- Each FR-R2 status has distinct, plain copy and a next action (fix address, retry, or visit the official county site).

### 11.11 Data freshness
- FR-F1: Show "last verified" timestamps at the contest and profile level.
- FR-F2: Provider responses are cached only within provider terms. Durable records retain provenance.

## 12. Election data strategy

- **Runtime resolver (now):** the Google Civic Information API (`elections`, `voterinfo`), wrapped behind ballot.ai's `BallotResolver` interface. Google Civic is a *provider*, not our model.
- **Ecosystem:** election officials → Voting Information Project (VIP) → Google Civic → ballot.ai. VIP is a future direct or bulk provider. It is not queried in parallel per request.
- **Enrichment providers:** state Secretary of State, county election offices, official voter guides, candidate sites, campaign-finance databases, manual overrides.
- **Source priority:** (1) state/local election authority → (2) official voter guide → (3) Google Civic / VIP → (4) official campaign site → (5) official campaign-finance database → (6) reputable nonpartisan secondary → (7) other secondary, only when necessary. A lower-priority source never silently overwrites a higher one.
- **Coverage tiers:** Tier 0 (ballot correctness) → Tier 1 (basic metadata) → Tier 2 (profiles) → Tier 3 (deep information). Nationwide Tier 0 is never delayed for Tier 2/3.

Details: [PROVIDER_ARCHITECTURE.md](../architecture/PROVIDER_ARCHITECTURE.md), [DATA_MODEL.md](../architecture/DATA_MODEL.md).

## 13. AI strategy

- **Claude never determines** which contests apply, who qualified, exact names, jurisdiction, official measure wording, number elected, or election dates.
- **Claude may support** structured extraction from official documents, summarization, neutral bios and position summaries with citations, measure explanations, neutral comparisons, contradiction detection, and data-quality review.
- **Mostly offline:** content is enriched ahead of time, validated against schema and provenance, stored, and then served. Page loads do not call an LLM. Real-time AI is reserved for explicit user requests such as "compare documented housing positions".
- **The voter's address is never sent to Anthropic.**
- The prior plan (Perplexity Sonar for research, Claude for writing, cron- and event-driven, never on user request) remains the baseline for Tier 2/3 synthesis. It is subject to the AI architecture review in [AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md).

## 14. Neutrality requirements

**Voice (owner, 2026-10-30):** ballot.ai reads like a nonpartisan news outlet. Positions, claims and specific facts are cited and attributed; explanatory and connecting sentences (how an office works, why a fact matters) may be uncited when they add no specific fact and stay descriptive, symmetric and plain. Sources span official pages, campaign materials (positions only) and vetted news coverage, including current events.

**Allowed:** factual background; documented positions with attribution; sourced voting records; attributed campaign statements; office responsibilities; measure effects; official arguments; campaign-finance facts; neutral comparisons; insights that follow from cited facts ("The next governor will oversee a $X budget and appoint judges"); and the two neutral forms in FR-K4, **In Brief** and **Might fit if you…** (a candidate's own cited positions paired with priorities a voter might hold, with an ⓘ saying ballot.ai does not recommend or rank).

**Not allowed:** a "best" or "worst" candidate; scores; rankings; recommended votes ("vote for X"); partisan persuasion; outcome predictions; verdicts on character; inference of user preferences.

**Neutrality is procedural.** Balance comes from identical sections, identical prompts and inputs, attribution, sourcing, and mechanical selection rules. Mixing left and right critiques does not create balance on its own.

**Decisions on prototype features (2026-10-28):**

| Prototype field | Decision |
|---|---|
| `bottomLine` | **Returned in a neutral form (owner, 2026-10-30)** as **In Brief** (FR-K4): experience, track record, platform attributed to the campaign; no comparisons or judgments. ("Their platform", its 2026-10-28 replacement, is now Key priorities.) |
| `strengths` / `criticisms` | **Removed.** They are written from a point of view, their selection is editorial, and their attribution is often vague ("critics on the left", "elites"). Their slot holds Endorsements; factual record goes in Past positions and the Timeline. Opinion-only content ("vague and untested") has no neutral form and is dropped. |
| `voteForIf` | **Returned in a neutral form (owner, 2026-10-30)** as **Might fit if you…** (FR-K4): the candidate's own cited positions only, never "vote for". User-driven matching against a voter's own selections stays a membership-tier idea (§22). |
| Polling "Frontrunner / Long shot" labels | **Removed.** These are predictive framing. |
| Wording rules | Plain verbs. No evaluative adjectives ("strong", "weak", "impressive", "controversial"). Experience gaps are never stated: the complete past-positions list lets users judge for themselves. |
| Prototype sections kept | Race intros (Context, Why it matters, What's at stake, The big picture), Background, Past positions (broadened), Key priorities, Key stances, Timeline, Endorsements, and In the news are kept and now cite every item. "Their platform", "Relevant experience", "Track record" and "Notable facts" (2026-10-28) are folded into Key priorities, Past positions, the Timeline and Background (2026-10-30). |

The deprecated June primary view (internal only) keeps its original fields with a "Deprecated · internal only" label.
- Party colors (red and blue) encode party only. Ordering never implies preference.

## 15. Privacy requirements

- The residential address is used only server-side to call the ballot resolver. It is **not** persisted, logged, sent to Anthropic, put in analytics, put in URLs, or stored in fixtures.
- A resolved ballot is stored under a **geography key** (a hash of the election and the set of electoral divisions), which many households share. It is time-limited.
- The ballot page shows coarse location (city or district), never the street address.
- Ballot pages are `noindex`. Address-derived pages never become public SEO pages.

Details: [PRIVACY.md](../architecture/PRIVACY.md).

## 16. Accessibility

- Target WCAG 2.2 AA: semantic headings per contest, labeled form fields, full keyboard navigation, visible focus, 4.5:1 contrast (party color is never the *only* encoding; always paired with a text label), reduced-motion support, and touch targets of at least 24px.
- Error messages are announced (`aria-live`) and tied to the field.

## 17. SEO / public discovery

- Public, indexable pages: landing, then methodology (not built yet), and later candidate, measure, and contest pages keyed by public geography (for example "San Mateo County measures, Nov 3 2026").
- **Address-resolved ballot pages are never indexable.**
- ZIP or city discovery pages may exist later as *navigation* into geography pages. They are never labeled "your ballot".

## 18. Reliability

- Provider timeouts with a single retry. Rate limits surface as `RATE_LIMITED` with retry guidance.
- Partial data is shown with a clear "incomplete" banner and a link to the official county sample ballot.
- Short-TTL provider caching, honoring provider `Cache-Control` and terms.
- Health is visible through privacy-safe metrics (§19). A provider outage is distinguishable from zero contests.
- Every ballot page carries a fallback link to the official county election office.

## 19. Analytics

Privacy-safe, aggregate, and never containing raw addresses.

| Metric | Definition |
|---|---|
| Resolution success rate | `SUCCESS + PARTIAL` / attempts, by state |
| Invalid / ambiguous address rate | Per attempt |
| Provider error and rate-limit rate | Per attempt, by provider |
| Zero-contest rate | `SUCCESS` with 0 contests (should be ~0; alerts) |
| Partial ballot rate | `PARTIAL` / attempts |
| Ballot load success | Ballot page 2xx / requests |
| Contest detail opens, source link opens | Engagement with provenance |
| Candidate comparisons, measure explanation opens | Depth engagement |
| Unsupported contest types | Counts by raw type |

Dimensions are limited to state, election, provider, status, and contest counts. There are no user identifiers beyond what the hosting platform requires.

## 20. Data quality

- Automated validators check for: zero contests, duplicate contests or candidates, a contest without choices, a measure without a title, a missing source, conflicting official names, a stale election, a wrong election date, a missing jurisdiction, an unsupported contest type, number-elected parsing, source conflicts, and provider response shape changes.
- Manual overrides are recorded with the original value, the corrected value, the reason, the authoritative source, and a timestamp. Imported data is never silently mutated.
- Every validated election produces QA reports (`reports/{election}/`).

## 21. Election lifecycle

| Stage | Behavior |
|---|---|
| **Upcoming** (provider lists the election) | Address lookup enabled. Enrichment pipeline runs. Banner shows days remaining and official deadlines (links) |
| **Active season** (ballots mailed or early voting) | Freshness emphasized. Overrides fast-tracked. Monitoring on |
| **Election Day** | Prominent link to official polling-place lookup. No results or predictions |
| **Post-election** | Election marked `archived`. Ballot pages show an "archived" banner. Lookup for archived elections becomes read-only (contests stored durably only from official sources) |
| **Future** | New election = new `elections` row + provider ID discovery + enrichment run |

## 22. Product roadmap

- **Near term (Nov 3, 2026):** address-first lookup; Google Civic resolver; normalized domain model; Tier 0/1 nationally; fully validated Daly City reference ballot; California and national coverage QA; June primary kept as a deprecated internal snapshot.
- **Possible membership tier (exploratory, not before 2027):**
  - Accounts and saved preferences.
  - "What matters to you" issue matching.
  - "Vote for X if…" style matching, driven by the user's own selections against documented positions.
  - Personalized insights.

  Principles:
  - Official ballot information and neutral profiles are **never paywalled**. Paid features only add matching on top.
  - Stored political preferences are sensitive personal information (CCPA/CPRA), so this tier needs explicit consent, minimization, and deletion controls before launch.
- **Medium term (2027):** repeatable election ingestion; official state/county enrichment; Tier 2 profiles via the offline AI pipeline; measure explainers; public candidate and measure pages.
- **Long term:** direct VIP and state feeds behind a composite resolver; nationwide Tier 2/3; partner API and embeds; multilingual support; durable civic-information product across every election cycle.

## 23. Success metrics

| Metric | Nov 3, 2026 target |
|---|---|
| Resolution success (valid addresses, covered states) | ≥ 97% |
| Daly City reference ballot: contests and choices matching the official sample ballot | 100% |
| Provider-failure-shown-as-empty-ballot incidents | 0 |
| Raw addresses persisted or logged | 0 |
| p75 ballot page load (cached enrichment) | < 2s |
| Ballots with ≥ 1 source link per contest | 100% |
| Source link open rate | Tracked (baseline) |

## 24. Risks

| Risk | Mitigation |
|---|---|
| Inaccurate ballot resolution | Authoritative providers only; official verification for reference ballots; "check your official sample ballot" link everywhere |
| Provider downtime | Explicit `PROVIDER_ERROR` state; official fallback links; short cache |
| Google dependency | Provider interface; composite resolver; VIP/state feeds roadmap |
| Quota exhaustion | One Civic call per new address (page views and shared links are served from the cache); `RATE_LIMITED` state with retry copy; quota monitoring; quota increase request before peak |
| Stale data | Freshness timestamps; lifecycle states; validators for stale elections |
| Misinformation | Neutrality rules; provenance on every fact; official sources win |
| AI hallucination | AI excluded from Tier 0; schema and provenance validation; every synthesized sentence checked (excerpts found, hard facts in its excerpts, a verifier, the neutrality lint and reviewer, parity), repaired once, else dropped; no human approval queue (owner, 2026-10-30) |
| Source conflicts | Recorded conflicts; priority order; manual override audit trail |
| Privacy | Address never persisted or logged; geography keys; noindex; redaction in logging |
| Late timing (6 days before Nov 3) | Tier 0 first; enrichment explicitly deferred |

## 25. Open questions

1. **Candidate-coverage rules** (`specs/phase-4-ingestion.md`: debate qualification, ≥3% poll, ≥$50K raised, or major-party nominee). Proposed resolution: these rules govern **enrichment priority only**. Every ballot-qualified candidate always appears at Tier 0. *Needs owner confirmation.*
2. ~~Editorial fields~~. **Resolved 2026-10-28**, see the §14 decisions table.
3. **Auto-highlighting (`<mark>`)** chooses which phrases to emphasize. Is that editorializing? **Partly resolved 2026-10-30:** the page's highlighter marks structural facts only (`auto="neutral"`); in written prose the model places 2–3 marks per section under code-checked rules (no evaluative words, parity across candidates, never a measure's own name, never in Might fit), with an off switch. Open: the owner's highlight workshop turns marked example paragraphs into rules and tests.
4. **News feeds.** Kept (decided 2026-10-28). Open: the source-balance policy, meaning which publishers are included and how they are mixed across candidates.
5. **Durable storage of Civic-derived contest lists** beyond cache TTL is subject to the Google API terms review. The fallback is to store only officially verified contests durably.
6. ~~Places Autocomplete~~. **Resolved 2026-10-28:** shipped as a server-side proxy (owner request). Costs are capped by a daily quota and a budget alert; see [PRIVACY](../architecture/PRIVACY.md) §2.
7. **Multilingual support:** which languages first (Spanish, Chinese, Tagalog, Vietnamese, Korean for California)?
8. **Geography public pages for SEO:** timing and granularity.
9. **Opt-in election reminders and alerts (future feature; owner, 2026-10-29).** Also the starting point for accounts. Not built. Before building it:
   - **Consent:** its own consent wording and a privacy policy update.
   - **Law:** TCPA consent for texts; CAN-SPAM for email.
   - **Storage:** secure, with deletion on request.
   - **No address link:** a contact is never linked to an address or a ballot. Reminders key off coarse location (state, or election) only.
   - **Not needed for research:** research for a newly looked-up ballot fills in within minutes without a reload, so no contact info is needed for that.
