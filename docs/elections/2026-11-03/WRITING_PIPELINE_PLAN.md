# Writing pipeline: handoff plan (owner-approved, 2026-10-29/30)

**Read this first** if you are the session building ballot.ai's synthesized writing.

**Status:**
- Every decision below is approved by the owner, and the Round 0 style examples (end of this doc) are approved.
- **Build done (2026-10-30):** schemas, prompts, checks (`src/lib/research/synthesis.ts`), the write/verify/review/repair flow and the race fairness pass (`src/lib/research/write.ts`), the read path and `?preview=`, the profile UI, and the docs. Round 1 (Haiku medium on the Placentia run set, `src/data/research/round.json`) is next.
- **Owner decision (2026-10-30):** the race-level fairness pass **rewrites** sentences that treat candidates unequally (keeping their facts and excerpts, re-checked) instead of dropping them; only a rewrite that can't pass the checks is dropped, and it is listed on `/internal/compare`.
- **Round 2 (owner, 2026-10-30, from round 1's preview):** not every sentence needs a citation (ballot.ai writes like a nonpartisan news outlet: claims and positions cited, explanation needn't be); no generic filler; fuller sections; news coverage added (the news feed's matched articles and a recent-news search). See AI_ARCHITECTURE.md and CLAUDE.md.
- **Round settings** live in a checked-in round file, `src/data/research/round.json` (run set + `model:effort:round` settings); `AI_COMPARE` still overrides it.
- CLAUDE.md / AGENTS.md hard rules still apply; where this doc changes one, it says so.

**Recommended setup** (CLAUDE.md asks for it):
- **Tool:** Claude Code.
- **Model:** Opus.
- **Effort:** High.
- **Skill:** `claude-api`, with its build-eval and hill-climb guides.
- **Mode:** Plan mode first, then Auto.

## Goal
Today the research pipeline only extracts verbatim-quoted facts (`src/lib/ai/extract.ts`, `src/lib/research/run.ts`). That makes ballot.ai a quote aggregator, not a guide.

The goal is synthesis: readable, neutral text in the June 2026 prototype's voice that combines several verified sources, with every sentence checked against them.

**What to keep from June:**
- **Race sections:** Context, Why it matters, What's at stake, The big picture.
- **Profile structure:** the June prototype's profile sections.

**What to drop from June:** its evaluative and partisan framing ("surged", "struggled", "most fractured", "aggressively filled", strengths and criticisms, rankings).

The June prototype is viewable at `/archive/ca-2026-primary/<zip>` on previews only. It renders from `src/data/deprecated/`.

## Owner decisions
- **Trust gate:** automated checks only; there is no human approval queue, so the checks must be strong.
- **Polls in race prose:** none (option A). Polls stay in the poll rail.
- **Scope of round 1:**
  - race intros (4 sections);
  - candidate narrative sections;
  - measures as plain-language synthesis;
  - Timeline.
- **Measures stay official-only.** Their facts come only from official analyses (CLAUDE.md hard rule).
- **Review ballot:** the owner's test ballot, **Placentia (92870), Orange County**. Its address-free ballot key is `s69mpTtE43T5nhHIsAzKQ2` (`/ballot/2026-11-03/<key>`).
  - **The address is never written anywhere**: not in code, docs, commits, prompts or logs. Refer to it only as "Placentia (92870) sample ballot".
  - **Stored ballots expire after 6 hours.** If it has, ask the owner to look the address up again.
  - **Its 30 research targets are already registered** in `research_state`, with no outcome yet.
- **Cost:** several revision rounds without large API spend.
  - The monthly cap `AI_MONTHLY_BUDGET_USD` is $40, enforced in `src/lib/ai/config.ts`.
  - About $12.44 was spent so far in October 2026.
  - Report spend after every round.
- **Model choice comes last.** Build first, revise prompts on Haiku at medium effort, run one Sonnet round, then do the final comparison (Steps below).
  - Model IDs live only in `src/lib/ai/config.ts`.
  - The existing comparison (375 held rows from 2026-10-29) tested the old quote-extraction pipeline, so it does not decide this one.

## Reversal of an earlier rule: "Might fit if you…" and "In Brief"
- **What it reverses:** PRD §14 removed `voteForIf` and `bottomLine`, and CLAUDE.md bans "vote for X if". The owner wants both back in a neutral form.
- **Docs to update in the same PR:**
  - CLAUDE.md and AGENTS.md (keep them in sync);
  - PRD §14 / FR-K4 (`docs/product/PRD.md`);
  - `specs/design-system.md`.

**"Might fit if you…"** (eyebrow on each candidate profile, with a ⓘ tooltip)
- **What it says:** exactly 4 lines, each a voter priority that matches one of the candidate's own cited positions.
  - Example: "…want the state to keep Medi-Cal coverage for undocumented adults" [n].
- **What it can draw on:** only the candidate's stated platform and issue stances, each line cited.
  - Not experience or past positions, identity, party, demographics or electability.
  - Nothing about other candidates.
- **Which issues:** the 4 the candidate emphasizes most in their own materials (statement, campaign site, Ballotpedia campaign themes), each a different issue.
  - If fewer than 4 positions are documented, show what exists plus "Limited documented information in reviewed sources".
- **Tooltip** (owner's wording): "These lines pair this candidate's own stated positions with priorities a voter might hold. They cover the four issues the candidate emphasizes most in their own materials. ballot.ai does not recommend or rank candidates."
- **Checks:**
  - each line starts "…want", "…support", "…oppose" or "…prefer" and matches a stance it cites;
  - lint rejects "vote for", "should", "best", party names and identity terms;
  - every candidate in a race has the same count;
  - no highlights.
- **Layout:** reuse the June "You should vote for X if…" list (`CandidateProfile.tsx`, around line 309) with the new eyebrow. The ⓘ follows the `MapYearInfo` pattern.

**"In Brief"** (the first part of June's bottom line, neutral; the Bottom Line callout, around line 339)
- **What it says:** 2–3 sentences, each cited, in this order:
  1. experience, meaning offices held, with durations;
  2. track record, the most-cited fact from their record in office;
  3. positioning and platform, attributed to the campaign.
- **What it never includes:**
  - comparisons with other candidates, strengths or criticisms, "critics say";
  - electability or momentum;
  - "establishment" or "outsider" labels, rankings ("deepest résumé"), or character judgments.
- **Durations** ("24 years"): code computes them from the cited start and end years. The model never writes a computed number.
- **Parity:** every candidate's In Brief follows the same template.

## Profile sections, in order (every item cited)
1. **In Brief**: in the Bottom Line callout.
2. **Background**: the eyebrow reads "Background", never "Bio".
   - Narrative prose, with notable facts merged in under one rule for everyone (e.g. "the first Latino to serve as attorney general").
   - There is no separate Notable facts section.
3. **Past Positions**: one line per position, in the form `Title (years)`, e.g. "U.S. Secretary of Health and Human Services (2021–2025)".
   - **It covers the whole résumé, not only government:** paid jobs, private practice, business roles, board seats, military service and nonprofit roles. `PERSON_RULES` in `src/lib/ai/prompts.ts` already asks for these, and review rounds check that private-sector roles appear when sources list them.
   - **Format:** chairs get their own line, and committee memberships go on a line under their position.
   - **Code change:** `positionLine` in `src/domain/profileFormat.ts` becomes `Title (years)`, with the district written out in full.
   - **Education:** a short code-written list underneath.
4. **Key Priorities | Key Stances**: the 2 pillar columns, in June's style: short noun phrases, no "Says…" in front, and no topic label in front of a stance.
   - Both keep their tooltips (`PILLAR_TOOLTIPS`, `CandidateProfile.tsx`), which do the attribution.
5. **Endorsements**: in the slot where Key Strengths and Key Criticisms used to be, as 2 rows of 2: Elected Officials | Unions, then Advocacy & Industry | Local Leaders.
   - Only confirmed, cited, named endorsements: no "soft endorsement", no unnamed "leadership".
6. **Might fit if you…**: as above.
7. **Timeline**: offices, past elections and results, key decisions and track-record events, and this election (debates, primary result, Nov 3).

**Removed sections:**
- "Their platform": replaced by Key Priorities.
- "Relevant experience": Past Positions covers it.
- "Track record on their priorities": folded into the Timeline.
- "Notable facts": merged into Background.

## Race intro sections (each has its own job; no repetition across them)
- **Context:** what's happening in this race: an open or contested seat, the field, and what voters say they care about.
- **Why it matters:** what the office controls, and the conditions that make this cycle different (a budget shortfall, gas prices, an insurance crisis). No lines that are true of every office in every state and year.
- **What's at stake:** the decisions the next officeholder will face here and now. Not a list of candidate platforms.
- **The big picture:** the race in general: its format (e.g. top-2), partisan history, and the state of the state as it bears on the role. No polls.

## How trust works for synthesized text
**Every sentence must pass all 5 checks.** A sentence that fails gets one repair attempt, then it is dropped. A section left empty shows "Limited documented information in reviewed sources" (PRD).

1. **Anchored to evidence.** Each sentence lists its sources and, for each, a short excerpt copied from that source.
   - Code checks every excerpt is really in its document (`quoteFound`, `src/lib/ai/checks.ts`).
   - The wording may paraphrase and combine; it does not have to repeat the excerpt.
   - The excerpts feed the [n] popovers (`CiteMarker`).
2. **Hard facts checked by code.** Every number, dollar amount, percentage, date and proper name must appear in its excerpts or among the item's own names.
   - No computed numbers: state the years instead.
3. **Meaning checked by a verifier.** A separate call asks, per sentence: "Does this follow from these excerpts, allowing paraphrase and combination?"
   - Reuse the calibrated support checker (`checkSupport`, `src/lib/ai/extract.ts`).
   - Choose between Haiku medium, Haiku high and Sonnet low from the comparison data.
4. **Neutrality**, in 2 parts:
   - **Lint:** the existing `neutralityProblem` (`src/lib/ai/checks.ts`), extended with the June offenders: "surged", "frontrunner", "fractured", "aggressively", "establishment", "elites".
   - **Reviewer:** a Haiku pass with this rubric:
     - loaded or partisan language;
     - unequal treatment of candidates;
     - predictions and horse-race framing;
     - unattributed claims of motive;
     - "critics say".
5. **Parity.** Every candidate in a race gets the same sections. A missing section shows the "Limited documented information" line; nothing is padded.

**Allowed vs not:**
- **Allowed:** insights that follow from cited facts ("The next governor will oversee a $X budget [1] and appoint judges [2]").
- **Not allowed:** predictions, rankings, "who should win", and verdicts on character.

**Lists stay code-written:** Past Positions and Education remain consistent lists, checked field by field, as built today (`src/lib/research/person.ts`).

## Writing standard: AP Stylebook, with ballot.ai's exceptions
**House rules that win over AP:**
- **Numerals always**, including 1–9 ("3 candidates"). Rephrase rather than start a sentence with a number.
- **Percent is always "%".**
- **The Oxford comma always.**

**AP unchanged otherwise:**
- state names abbreviated AP-style only after a city;
- titles capitalized before a name, lowercase after;
- AP date and time style.

**Code check:** a small check flags common AP slips, and the repair pass fixes them.

**Docs:** `specs/design-system.md` and CLAUDE.md / AGENTS.md name AP as the house style.

## Highlights (`<mark>`)
- **Who places them:** the model places them in prose. The `auto="neutral"` highlighter (`src/components/Highlight.tsx`) stays for structural facts.
- **What code checks:**
  - at most 3 per prose section;
  - a list highlights every item or none;
  - every candidate in a race gets the same count per section, within 1;
  - no evaluative words inside a highlight;
  - never a measure's own name or number;
  - "Might fit if you…" is never highlighted.
- **Reviewer:** the neutrality reviewer also reviews highlights.
- **Off switch:** one flag turns highlights off.
- **Later workshop:** after the style is settled, the owner marks example paragraphs, and those marks become rules and tests.

## Prompt design (`src/lib/ai/prompts.ts`)
- **Style guide, written from the June text:**
  - lead with the most important fact;
  - be concrete: numbers, dates, named programs;
  - connect facts ("which means…", "because…");
  - 2–4 sentences per section;
  - plain words a 9th grader can follow;
  - attribute claims ("Says…", "The Legislative Analyst estimates…");
  - wrap 2–3 load-bearing phrases per section in `<mark>`.
- **Section specs:** each section gets a purpose line and its do's and don'ts.
- **Examples:** the approved Round 0 examples below, labeled "style only, not facts".
- **One call per item** writes all its sections from a shared document set. The documents are sent once, and the repair pass reuses the prompt cache.
- **Output schema** (`src/lib/ai/schemas.ts`):
  - `sections[] → sentences[] → { text, refs: [{ sourceId, excerpt }] }`;
  - plus the structured lists for people.
- **Versioning:** bump `PROMPT_VERSION` every round, with a snapshot test.

## Steps
### Build (one PR)
1. **New target kind `race`** (`src/lib/research/targets.ts`): one per candidate contest, writing the 4 intro sections.
   - **Sources:** the office's official pages, vetted news, and the race's Ballotpedia page.
   - **Known issue:** Ballotpedia currently returns empty to our reader. The "Pages tried" diagnostics record it.
2. **People and measures switch to the synthesis schema.**
   - **Measures:** official sources only.
   - **People:** official sources first, then vetted news, then the campaign site (platform only). Wikipedia only helps find sources; it is never cited.
3. **`src/lib/research/synthesis.ts`** (new, pure) holds the checks: excerpts found, hard facts, neutrality lint, parity and highlight rules.
   - The verifier, the neutrality reviewer and the single repair pass are wired in `src/lib/research/run.ts`.
4. **Read path** (`src/lib/ballot/research.ts`): synthesized sections go into existing fields, and excerpts travel with each sentence for the popover. The AI label stays.
   - **Races** (`ContestEnrichment`): `context`, `whyItMatters`, `stakes`, `bigPicture`.
   - **People** (`CandidateEnrichment`): `inBrief`, `background` (`bio`), `priorities`, `stances`, `mightFit`, `timeline`, `endorsements`.
   - **`CandidateProfile.tsx`:** drops "Their platform", "Relevant experience", "Track record" and "Notable facts", and moves Endorsements into the 2×2 slot.
   - **Measures** (`MeasureEnrichment`): `summary`, `yesMeans`, `noMeans`, `impact`. Measures already answer the six "What it means for you" questions.
5. **Rounds and the preview:**
   - **Round tags:** a setting becomes `model:effort:round` (e.g. `claude-haiku-5-5:medium:r1`). Each round's results are stored as held rows under their own tag.
   - **`?preview=<setting>`:** on preview deployments only (production ignores it), the real ballot page renders that round's held results in place of published ones. There is no address in the URL, only the stored ballot key.
   - **Run set:** a new run set covers every item on the Placentia ballot, by durable ids only.
6. **Tests:**
   - an invented number or name is rejected, and a paraphrase is kept;
   - the neutrality lint additions;
   - parity and the highlight rules;
   - a schema snapshot;
   - read-path mapping, including at least one non-CA case (CLAUDE.md);
   - `?preview` is ignored in production.

### Revision rounds (cheap)
- **Rounds 1..n:** Haiku at medium effort on the full Placentia ballot.
  - **Cost:** about $2–4 per round for roughly 80–100 items, including the verifier and reviewer.
  - **After round 1,** stored documents are reused, so pages aren't re-read.
- **Each round:**
  1. Send the owner the preview link.
  2. The owner sends notes.
  3. Revise the prompts.
  4. Run the next round.
- **One Sonnet medium round** once the prompts are close, about $10–15.
- **Final comparison:** Haiku and Sonnet at low, medium and high (6 columns) on the 30-item comparison set (`/internal/compare`), using the final prompts. About $10–15.
  - The owner then picks a model and effort per section type, and publishing turns on (record it in `docs/architecture/MODEL_DECISIONS.md`).

### Verification
- **Local:** `npm run lint`, `typecheck`, `test`, `validate:ballots` and `build`.
- **Browser:** the preview page renders the 4 race sections, every profile section and measure synthesis, with [n] popovers, on desktop and mobile.
- **Each round, in production:**
  - every sentence has at least one excerpt found in its source;
  - no hard fact is missing from its excerpts;
  - zero lint hits;
  - all rows held;
  - spend matches the estimate.

## Coordination with other sessions working in this repo (2026-10-30)
- **News session** (`claude/loving-curie-e7gtw3`): works in `src/lib/feeds/`, `src/components/NewsFeed.tsx`, the news cron routes and `src/data/sources/news.json`.
  - **Next up there:** the GDELT data-file collector and a "group same-event coverage" preview.
  - **Avoid editing those files.**
- **React #418 session:** fixing a hydration mismatch on the ballot page, likely in relative dates in `NewsFeed.tsx`.
- **Migration numbers:**
  - this pipeline uses **0017–0019**;
  - the news session uses 0020 and up;
  - the latest applied today is `0016_feed_paging_cycle.sql`.
- **Shared resources:**
  - one production Supabase project, so keep migrations additive;
  - one Vercel project;
  - one $40 monthly AI cap.
- **Before a PR,** merge `origin/main` first.

---

## Approved Round 0 examples (style only; the facts come from the June snapshot and are not to be reused)
**Bold** marks a highlight.

### Governor race intro
**Context**
California is choosing a new governor for the first time in 8 years because Gavin Newsom is term-limited [1]. The primary ballot listed 61 qualified candidates, and 7 of them debated on CNN on May 5 [2]. In statewide surveys, voters name **affordability, housing, and homelessness** as their top concerns [3].

**Why it matters**
The governor proposes a $300 billion state budget that serves **39 million residents** [4], signs or vetoes every bill the Legislature passes, and appoints judges and most department heads [5]. The next governor takes office as the state faces **a structural budget shortfall** [6], the highest gas prices in the country, an unemployment rate tied for the highest [7], and **a home insurance market strained by wildfires** [8]. All 3 bear directly on the affordability and housing concerns voters name most [3].

**What's at stake**
The next governor's first budget will have to **close the shortfall** [6], which means choosing among spending cuts, new revenue, and drawing on reserves [9]. The governor appoints most members of the **California Air Resources Board** [10], which sets the rules behind the state's fuel standards and climate deadlines. The governor also decides each year, through the budget, how much state money goes to local homelessness programs [11].

**The big picture** (no polls)
The winner will be California's first new governor since 2019 [1] and will inherit programs started under Newsom, including **CARE Court** for people with severe mental illness [12], Medi-Cal coverage for undocumented adults [13], and the state's 2035 goal for zero-emission new-car sales [14]. Each one can be expanded, scaled back, or kept. Under California's top-2 system, the 2 candidates with the most votes in the June 2 primary advance to November regardless of party [15]. No Republican has won a statewide race in California since 2006 [16].

### Becerra profile
**In Brief**
Becerra, a Democrat, spent **24 years in the U.S. House**, 4 years as California attorney general, and 4 years as U.S. secretary of health and human services [1]. As attorney general, he filed **more than 120 lawsuits against the first Trump administration** [2]. His campaign presents that experience as the basis for his run [3]. It lists protecting Medi-Cal, challenging in court federal actions it considers overreach, and revising climate timelines if needed to keep fuel affordable [3].

**Background**
Becerra represented Los Angeles in the U.S. House from 1993 to 2017 and chaired the House Democratic Caucus from 2013 to 2017 [1]. Gov. Jerry Brown appointed him attorney general in 2017, and he became the first Latino to hold the office [2]. As health and human services secretary, he oversaw **the end of pandemic-era Medicaid enrollment rules** and **the start of Medicare drug-price negotiation** [4]. He entered the governor's race in 2024 [5].

**Past Positions**
- U.S. Secretary of Health and Human Services (2021–2025)
- California Attorney General (2017–2021)
- Chair, House Democratic Caucus (2013–2017)
- U.S. Representative, California's 30th, 31st, and 34th congressional districts (1993–2017)
  - Committees: Ways and Means

**Key Priorities** ⓘ
- Emergency declaration to **freeze utility and home insurance rates** [3]
- Health care access — **protecting Medi-Cal**, including coverage for undocumented adults [3]
- **Challenging federal policies in court** that he considers overreach [3]
- **Revising climate timelines** to keep fuel affordable in the near term [3]

**Key Stances** ⓘ
- Open to revising the **2035 electric-vehicle deadline** and other climate timelines if affordability is at stake [6]
- Supports the **state's sanctuary law** and would sue over federal immigration enforcement he considers overreach [6]
- Supports expanding **CARE Court** and changing conservatorship rules for people who are chronically homeless [6]
- Would continue **Medi-Cal coverage for undocumented adults** and expand access to reproductive care [6]

**Endorsements**

| Elected Officials | Unions |
|---|---|
| U.S. Sen. Alex Padilla · Rep. Lou Correa · Rep. Norma Torres | California Faculty Association |

| Advocacy & Industry | Local Leaders |
|---|---|
| Equality California · Planned Parenthood Affiliates of California | London Breed, former San Francisco mayor |

**Might fit if you…** ⓘ
- …want the state to keep Medi-Cal coverage for undocumented adults [6]
- …support keeping the sanctuary law and challenging federal enforcement in court [6]
- …want an emergency freeze on utility and home insurance rates [3]
- …prefer flexible climate deadlines if that keeps fuel costs down [6]

**Timeline**
- 1987: Joined the California Department of Justice as a deputy attorney general
- 1990: Elected to the California State Assembly
- 1992: Elected to the U.S. House (took office in 1993)
- 2013: Became chair of the House Democratic Caucus
- 2017: Appointed attorney general by Gov. Jerry Brown, succeeding Kamala Harris
- 2017–2021: Filed more than 120 lawsuits against the first Trump administration
- 2018: Elected to a full term as attorney general with 63% of the vote
- 2021: Confirmed as health and human services secretary, 50–49
- 2023: His department began ending pandemic-era Medicaid enrollment rules
- 2024: Medicare announced its first negotiated drug prices
- 2024: Entered the governor's race
- May 5, 2026: Took part in the CNN debate
- June 2, 2026: Primary (result from certified returns)
- Nov. 3, 2026: General election
