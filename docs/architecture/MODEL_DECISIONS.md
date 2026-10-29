# Model decisions for the research job

**Status:** waiting on the owner's review of the model comparison (2026-10-29). Until then the job runs in **compare mode** (`AI_MODE` unset, or `compare`). Compare mode researches only the comparison set, at every setting, and holds every result. Nothing is published.

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
| 3 | Judge bios (current role, background, past positions) | | | `ANTHROPIC_MODEL_PROFILE` | |
| 4 | Candidate background and past positions | | | same as 3 | |
| 5 | Candidate stated priorities (attributed) | | | same as 3 | |
| 6 | Quote-support checker | | low | `ANTHROPIC_MODEL_CHECK` | Fails closed; drops anything its quote doesn't support |
| 7 | Effort level per item | | | the `:effort` suffix on 1, 3, 10 (e.g. `claude-haiku-5-5:high`) | |
| 8 | Monthly budget and how many jobs run at once | | | `AI_MONTHLY_BUDGET_USD` (default 40), `AI_MAX_INFLIGHT` (default 12) | Keep the budget below the Console workspace limit |
| 9 | Anything to leave off | | | | e.g. priorities, if no setting does them reliably |
| 10 | "What this office does" (duties, term, seats; salary only if stated) | | | `ANTHROPIC_MODEL_OFFICE` | |
| 11 | The search step that finds `.gov` / Ballotpedia pages (URLs only; writes nothing) | | | `ANTHROPIC_SEARCH_MODEL` | Default Haiku with the basic web search tool |

## After the decisions
1. Record them above.
2. Set the env vars in Vercel Production.
3. Set `AI_MODE=publish`.

The job then researches every item on every looked-up ballot at those settings and publishes what passes the checks. The compare rows stay held and are never read by a ballot page.
