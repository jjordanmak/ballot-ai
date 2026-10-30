# Model decisions for the research job

**Status (2026-10-30):** the writing pipeline (`docs/elections/2026-11-03/WRITING_PIPELINE_PLAN.md`) replaced quote extraction for races, people and measures, so the 2026-10-29 comparison (375 held rows) no longer decides those rows. Order: revision rounds on Haiku medium (Placentia run set, `?preview=<setting>`), one Sonnet medium round, then the final 6-column comparison (Haiku and Sonnet × low / medium / high) on the Daly City set with the final prompts. Until then the job runs in **compare mode** and holds every result. Nothing is published.

**Rounds:** set the run set and settings in `src/data/research/round.json` (e.g. `claude-haiku-5-5:medium:r2`), bump `PROMPT_VERSION` with every prompt change, and review with `/ballot/2026-11-03/<key>?preview=<setting>` on a preview deployment and on `/internal/compare?set=<run set>`. For the final comparison, set `runSet` to `daly-city-compare` and the 6 settings.

## Where to compare
- **Page:** `/internal/compare` on the branch's Vercel preview. Log in to Vercel when asked.
  - Production returns 404 on purpose.
  - The page reads the held results live from the database, and they are never shown on a ballot page.
- **The set:** `src/data/research/compare-set.json`, about 30 items from the Daly City (94015) sample ballot. It stores contest and candidate ids and office keys only; there is no address anywhere.
  - 6 measures (3 statewide, 3 local);
  - 4 retention judges;
  - 12 candidates (both candidates in each race);
  - 8 office descriptions.
- **Columns:** 9 settings, Haiku / Sonnet / Opus × low / medium / high effort (`AI_COMPARE`).
  - Every column gets the same documents, the same prompt and the same checks; only the extraction model and effort differ.
  - The quote-support checker is the same for every column (`ANTHROPIC_MODEL_CHECK`, default Haiku).
- **Cost:** about $25, one time. Once its documents are unchanged, a cell isn't re-run for 7 days.

## How to review
1. **Summary table:** cost per item, seconds per item, answers kept, rejections by reason (quote not found, unsupported, neutrality), and questions left blank, per setting.
2. **Narrow it down:**
   - "Only where settings differ" shows only the items whose answers differ; a yellow bar marks each differing field.
   - Hide columns from the summary table.
3. **Per item:** each answer shows its quote and source link. Rejected answers are gray, with the reason. Cost and time are at the foot of each cell.

## Decisions (one line each: model, effort, notes)

| # | Item | Model | Effort | Env var it sets | Notes |
|---|---|---|---|---|---|
| 1 | Measure summary, YES means, NO means (only where curated text is missing) | | | `ANTHROPIC_MODEL_MEASURE` | |
| 2 | Measure "What it means for you" (the six answers) | | | same as 1 (one call per measure) | Split from 1 only if they need different models |
| 3 | Finding a person's facts (education, positions, platform; judges and candidates) | | | `ANTHROPIC_MODEL_PROFILE` | Fields only; code checks every name and year and writes every line |
| 4 | ~~Writing the short bio from those facts~~ | | | — | Replaced by row 14 (the writer produces Background directly) |
| 5 | What gets selected (rules in `PERSON_RULES`) | | | edit the rules, not a model | Use each column's "Left out" list to see each model's judgment |
| 6 | Quote-support checker (prose claims only) | Haiku | high | `ANTHROPIC_MODEL_CHECK` (`model:effort`) | Same setting as row 16 (2026-10-30) |
| 7 | Effort level per item | | | the `:effort` suffix on 1, 3, 10 (e.g. `claude-haiku-5-5:high`) | |
| 8 | Monthly budget and how many jobs run at once | | | `AI_MONTHLY_BUDGET_USD` (default 40), `AI_MAX_INFLIGHT` (default 12) | Keep the budget below the Console workspace limit |
| 9 | Anything to leave off | | | | e.g. priorities, if no setting does them reliably |
| 10 | "What this office does" (duties, term, seats; salary only if stated) | | | `ANTHROPIC_MODEL_OFFICE` | |
| 11 | The search step that finds `.gov` / Ballotpedia / vetted-news / Wikipedia (finder) pages (URLs only; writes nothing) | | | `ANTHROPIC_SEARCH_MODEL` | Default Haiku with the basic web search tool |
| 12 | Office descriptions for places whose official site isn't `.gov` (e.g. Daly City's `dalycity.org`) | | | rule change | Today they find no documents |
| 13 | Race intros (Context, Why it matters, What's at stake, The big picture) | | | `ANTHROPIC_MODEL_RACE` | Writing pipeline |
| 14 | Profiles: In Brief, Background, Key Priorities, Key Stances, Might fit, Timeline, Endorsements (and the lists) | | | `ANTHROPIC_MODEL_PROFILE` | One call per person writes all sections; replaces rows 3–4 |
| 15 | Measures: plain-language synthesis of the official analysis | | | `ANTHROPIC_MODEL_MEASURE` | Replaces rows 1–2; official sources only |
| 16 | Verifier ("does this follow from these excerpts?") | Haiku | high | `ANTHROPIC_MODEL_CHECK` (code default since 2026-10-30) | **Decided 2026-10-30.** Calibration on 435 claims: Haiku high agreed with Haiku medium on 97%, Sonnet low on 91%. In 24 sampled disagreements, Sonnet low rejected about 8 plainly supported claims; Haiku high caught a detail Haiku medium let through ("in San Mateo County") and accepted 2 supported claims medium rejected |
| 17 | Neutrality reviewer and race fairness pass | | | `ANTHROPIC_MODEL_REVIEW` | Default Haiku medium |
| 18 | Highlights in written prose | | | `AI_HIGHLIGHTS` (`off` strips them) | After the highlight workshop |

## After the decisions
1. Record them above.
2. Set the env vars in Vercel Production.
3. Set `AI_MODE=publish`.

The job then researches every item on every looked-up ballot at those settings and publishes what passes the checks. The compare rows stay held and are never read by a ballot page.
