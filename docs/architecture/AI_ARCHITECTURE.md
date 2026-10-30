# AI Architecture

> Product rules: [PRD §13–14](../product/PRD.md#13-ai-strategy) · Prior synthesis plan: [`specs/phase-5-synthesis.md`](../../specs/phase-5-synthesis.md)

## 1. Audit (2026-10-28)

The application has **no Anthropic integration today**. There is no SDK dependency, no API route, no prompts, and no model IDs in code. The only traces are:
- a commented `ANTHROPIC_API_KEY` in `.env.example`;
- the 0003 tables `synthesis_runs` and `synthesized_field_versions`, which have `model` and `prompt_version` columns but are unused;
- the Phase 5 spec, which plans Perplexity Sonar for research and Claude for writing, cron- and event-driven, with no model ID chosen.

There are therefore no deprecated models to migrate. Centralized configuration is introduced from the start.

**Claude Code vs. runtime:** Claude Code authentication is separate from ballot.ai's runtime `ANTHROPIC_API_KEY`. Development sessions never need the production key.

## 1a. Built (2026-10-29)

The research pipeline exists, runs in the app (never in a Claude Code session), and is off until the owner sets `ANTHROPIC_API_KEY` and `AI_SYNTHESIS_ENABLED=on` (docs/infrastructure/ENVIRONMENT.md).

| Piece | Where |
|---|---|
| Model IDs, kill switch, monthly budget, prices | `src/lib/ai/config.ts` (default `claude-haiku-5-5`, owner decision 2026-10-29) |
| Structured extraction + quote-support check | `src/lib/ai/extract.ts` (`messages.parse` + zod; standard API, no batching, so updates land within the hour) |
| Output schemas, caps | `src/lib/ai/schemas.ts` |
| Quote, neutrality and cleanup checks | `src/lib/ai/checks.ts` |
| Targets (registry) and where to look | `src/lib/research/targets.ts` + `src/data/sources/official-guides.json` (see "Sources per kind" below) |
| Polite fetching, PDF text | `src/lib/research/fetch.ts`, `robots.ts` |
| Search for `.gov` / Ballotpedia pages | `src/lib/research/search.ts` |
| Dispatch, run, store | `src/lib/research/run.ts`, dispatched every minute by `/api/cron/research` (`vercel.json`), state in `research_state` (migration 0012) |
| Model comparison (owner review before publishing) | `src/data/research/compare-set.json`, `src/lib/research/compareReview.ts`, `compareLoad.ts`, `/internal/compare`; decisions in [MODEL_DECISIONS](MODEL_DECISIONS.md) |
| Verification into the stored shape | `src/lib/research/verify.ts` |
| Read path (curated wins; labeled) | `src/lib/ballot/research.ts`, `researchRead.ts`; `AiLabel` in `src/components/ballot/Citations.tsx` |
| Tables | migrations 0010 (payload/status on `synthesized_field_versions`, `sources.content_text`, `add_api_spend`), 0011 (public read of published, current rows), 0012 (`research_state`, `fetch_hosts`, `claim_research_jobs`, `reserve_host_slot`, the `research` broadcast) |

**Scheduling (owner, 2026-10-29).**
- **Dispatcher, every minute, production only.** Each run:
  - records any new jobs in `research_state`;
  - claims the due ones atomically (`claim_research_jobs`, so two runs never take the same job), up to `AI_MAX_INFLIGHT`;
  - calls the same route once per job (`?job=<key>`, with the cron secret). Each job is its own function invocation with its own 300 s limit, so a whole ballot finishes in minutes.
- An idle minute is one cheap query.
- **Re-reads:** a job comes due again 6 hours after it ran (+0–30 min jitter); compare-mode cells, 7 days.
- **Claude runs only when a document's text changed.** Re-reading is a plain web request (often a 304).

**Polite fetching.**
- robots.txt is honored for `*` and `ballot.ai`, cached a day per site.
- At most one request per site every ~10 s across all workers (`reserve_host_slot`, with jitter). A worker that would wait over 25 s uses the stored copy.
- Conditional requests (ETag / Last-Modified).
- An honest user agent.
- A 403/429 doubles the site's spacing (up to 16×), and success halves it.
- A site that blocks automated readers is skipped, never worked around.

**Sources per kind (owner, 2026-10-29; the same for every item of a kind):**
- **Measures:** official only. That means the state guide (statewide), or the county's official election page and the links on it (local), with PDFs read only from the official hosts listed per state (`officialPdfHosts`), plus a `.gov`-only search. Never Ballotpedia.
- **Judges and candidates:**
  - their official statement (state guide for statewide offices, county page otherwise);
  - `.gov` pages and their own Ballotpedia page, found by one cached search;
  - their campaign site, only when an official filing or Ballotpedia links it.
  - Official documents come first in the prompt.
- **What this office does:** `.gov` pages only, one description per office and place (`officeKeyFor`; e.g. one for all 80 Assembly districts). Shown in the race header as "The office".

**One document set per item, shared by every setting.**
- **Gathering:** the first job for an item does it, holding the `<item>#search` row:
  - it searches;
  - it reads the pages fresh, so it can follow their links;
  - it records the exact pages used.
- **Other settings** wait for that, then read the same stored copies, so every comparison column sees byte-identical documents.
- **Busy site:** if the site is too busy to read, the job waits 1–2 minutes and retries rather than running on fewer documents. After 10 waits it runs with what it has.

**Synthesized writing (owner, 2026-10-30; `docs/elections/2026-11-03/WRITING_PIPELINE_PLAN.md`).** Race intros, people and measures are written as prose; offices keep the quoted-answer flow below.
- **One call per item** (`writeItem`, `src/lib/research/write.ts`) writes every section from the shared document set. Every sentence is `{ text, refs: [{ sourceId, excerpt }] }`: it may paraphrase and combine sources, and its excerpts must together say what it says.
- **5 checks per sentence** (code in `src/lib/research/synthesis.ts`):
  1. each excerpt is found in its document (`quoteFound`);
  2. every number, %, $, date and proper name is in its excerpts or the item's own names (number words and AP abbreviations are normalized; durations in In Brief are written by code from verified years via `{{years:Pn}}`, never by the model);
  3. a verifier (`checkSupport`, synthesis mode, one batched call): "does this follow from these excerpts, allowing paraphrase and combination?";
  4. the neutrality lint (`neutralityProblem`, plus In Brief / Might fit / profile rules) and a reviewer call (Haiku, `ANTHROPIC_MODEL_REVIEW`) with the rubric: loaded or partisan language, predictions and horse-race framing, unattributed motive, "critics say", highlights;
  5. parity: every candidate in a race gets the same sections; the race job's fairness pass reviews a race's candidates side by side and **rewrites** unequal sentences (keeping their facts and excerpts, re-checked) instead of cutting them (owner, 2026-10-30). Rewrites apply on the page only while the sentence is unchanged.
- **One repair pass:** whatever failed (or has an AP slip) goes back to the writer with its reasons, in the same conversation, so the documents are read from the cache. A sentence that still fails a trust check is dropped and logged with its text; a style slip never drops a sentence. A section left empty is listed as `limited` and the page says "Limited documented information in reviewed sources".
- **Lists stay code-written:** education and positions are checked field by field (`screenFacts`, `src/lib/research/person.ts`) and formatted by `src/domain/profileFormat.ts` (`Title (years)`).
- **Race intros** (`race:<contestId>:race`): `.gov` pages, vetted news and the race's Ballotpedia page by search; the job waits (up to 30 × 2 minutes) for its candidates' results so the fairness pass can run.
- **Payloads:** race `v1`, measure `v2` (sections), person `v3` (sections, Might fit, timeline, endorsements, lists). The read path (`src/lib/ballot/research.ts`) maps each sentence to a `Cited` with its excerpts for the [n] popover, applies the fairness rewrites, and evens highlights out across a race.
- **Rounds:** `src/data/research/round.json` names the run set (`src/data/research/run-sets/`, durable ids only) and the settings (`model:effort:round`). Each round's results are held under their own tag and shown with `?preview=<setting>` on the real ballot page, on previews only (production ignores it). Rounds reuse stored pages (14 days) instead of reading them again.

**People (lists): facts checked field by field.**
- Code (`src/lib/research/person.ts`) checks every institution, title, organization and year against that field's quote; drops "present" from archived or long-outdated pages; merges duplicates (keeping the more trusted source and recording the conflict); and writes every line itself (`src/domain/profileFormat.ts`).
  - **Education:** degree, field, institution, year.
  - **Positions:** title, organization, district, years, type, plus committee memberships.
  - **Residence:** local races only.
- **Selection rules:** these are in `PERSON_RULES` (`src/lib/ai/prompts.ts`). In compare mode the model also lists what it left out and why.
- **Sources for people, in trust order:**
  1. official pages (`.gov`, voter guides, court bios);
  2. Ballotpedia;
  3. articles from the vetted outlets in `src/data/sources/news.json`;
  4. the campaign site (platform only).

  Wikipedia is a finder only: its reference links are followed, and it is never cited. Measures and offices stay official-only.
- **Diagnostics:** every page tried, and why any was skipped, is in `synthesis_runs.metadata.tried` and shown on `/internal/compare`.
- **Checker:** Haiku at high effort by default (owner, 2026-10-30, from the calibration data in MODEL_DECISIONS.md row 16). In compare mode the settings in `AI_CHECK_COMPARE` also judge every prose claim, for calibration.

**Prompts and caching (owner, 2026-10-29).**
- **One file:** every prompt lives in `src/lib/ai/prompts.ts`, with one `PROMPT_VERSION` and a snapshot test, so wording changes are deliberate.
- **Already cached:** the frozen instructions (research, and the writing guide with its style examples). The run log shows reads on repeat calls, and the review page has an "Input from cache" column.
- **Documents:** the writing call caches its first user turn (documents + task) because the repair pass resends it within the same setting (2026-10-30). The quoted-answer flow (offices) still doesn't: changing effort invalidates the message-level cache, so effort columns can't share it. Documents never go in the system prompt: fetched pages are untrusted data and must not carry instruction authority.

**Compare mode (`AI_MODE=compare`, the default until the owner decides).**
- Only the round's run set runs (`src/data/research/round.json`), once per setting in the round file or `AI_COMPARE`. The first comparison (9 columns on the Daly City set) is `DEFAULT_COMPARE` with run set `daly-city-compare`.
- Each result is stored as `held` ("model comparison") under `<field>@<model>:<effort>[:<round>]`. The ballot page reads only `published` rows, so none of it is served.
- `synthesis_runs.metadata` keeps the setting, raw output, every rejected answer with its reason, tokens, cost and seconds.
- **`AI_MODE=publish`:** every item at its kind's setting (`ANTHROPIC_MODEL_MEASURE` / `_PROFILE` / `_OFFICE` / `_RACE`, each `model[:effort]`).

**Live refresh.** A published row fires the `research` event on the ballot's existing Broadcast channel `feed:{election}:{state}` (trigger in 0012). The page re-renders its server data in place (`LiveFeed.tsx`), so a visitor never reloads.

How one item is made:
1. **Fetch.**
   - What is fetched: the target's pages, up to 4 same-site pages they link to (links naming the target first, e.g. "Measure Z"), and the search results.
   - Everything goes through `safeFetch` (public hosts only) and the polite rules above.
   - Storage: main text, or PDF text, is stored on `sources`. Long documents are narrowed to the passages about the target.
2. **Skip if unchanged.** The input hash covers the document texts, model and prompt version, so nothing is re-run unless a cited document changed.
3. **Extract.** Every answer is `{text, quote, sourceId}` or null.
4. **Check.**
   - The quote must appear in the cited document (case, spacing, quote styles and dashes ignored; "…" allowed between parts in order).
   - The text passes the neutrality lint.
   - The text is capped.
   - Only `<mark>` tags survive.
5. **Confirm.** A second, low-effort call answers "does this quote, on its own, support this sentence?" for every claim. Unsupported claims are dropped, and the check fails closed.
6. **Store.**
   - A version with surviving answers is `published`.
   - A version where nothing survived is `held`, with the reason.
   - Every run logs model, prompt version, cost and rejections in `synthesis_runs`.

Not yet:
- **States:** states other than California in `official-guides.json`. Elsewhere, measures and offices rely on the `.gov` search, and people on search plus Ballotpedia.
- **Counties:** counties other than San Mateo.
- **Scans:** scanned (image-only) PDFs are skipped as "unreadable pdf".

## 2. Trust boundary

| Claude MUST NOT determine | Claude MAY do (offline, with sources) |
|---|---|
| Which contests apply to an address | Structured extraction from official PDFs and pages (candidate statements, measure text) |
| Candidate qualification / exact ballot names | Long-document summarization (measure full text → plain language) |
| Jurisdiction applicability | Neutral candidate bio and position summaries with citations |
| Official measure wording / applicability | Neutral side-by-side comparison of documented positions |
| Number elected, election dates | Contradiction detection between sources; data-quality review |

These are enforced structurally, not only by prompt:
1. Tier 0 fields (contests, names, vote-for, measure titles, dates) are written **only** by provider normalization or official-source curation. The AI pipeline has no write path to `contests`, `contest_candidates`, `measures`, or `elections`.
2. AI output is written only to `synthesized_field_versions` with `source_ids` (non-empty required), `model`, and `prompt_version`.
3. The UI renders AI content in a distinct "AI-generated summary · sources" container, visibly separate from **Official** and **Source-derived** content.
4. **The voter's residential address is never in any prompt.** Prompts are built from stored entities (candidate, contest, sources), never from request context.

## 3. Processing strategy

```
official / source documents ─► fetch + hash (sources) ─► extraction (EXTRACTION model, structured output)
   ─► schema validation (zod) ─► provenance validation (every claim cites a source_id that exists
      and was fetched) ─► neutrality lint (banned phrasing: "best", "should vote", rankings, predictions)
   ─► synthesized_field_versions (is_current) ─► served from DB
```

- **Page loads never call Claude.**
- **Real-time AI** is reserved for explicit user actions (P2), for example "compare documented positions on housing". Inputs are stored entities and sources only. Output is cached by `(contest, topic, source-set hash)`, rate-limited, and labeled.
- Runs are triggered by cron or material events, as in the Phase 5 spec, never by page views.

## 4. Model configuration (central)

`src/lib/ai/config.ts` (P2) is the **only** place model IDs appear. Values come from env with defaults:

| Env var | Purpose | Default (verified 2026-10-28 via Anthropic model table) |
|---|---|---|
| `ANTHROPIC_API_KEY` | Runtime key (server-only) | — |
| `ANTHROPIC_DEFAULT_MODEL` | Fallback for every publish-mode setting below | `claude-haiku-5-5` (owner, 2026-10-29: lowest cost; every answer is quote-checked in code) |
| `ANTHROPIC_MODEL_MEASURE` / `_PROFILE` / `_OFFICE` | Publish mode: `model[:effort]` per kind (measures; judges and candidates; office descriptions) | the default model, medium effort (pending [MODEL_DECISIONS](MODEL_DECISIONS.md)) |
| `ANTHROPIC_MODEL_CHECK` (or the older `ANTHROPIC_EXTRACTION_MODEL`) | The quote-support check | `claude-haiku-5-5` |
| `ANTHROPIC_SEARCH_MODEL` | The search step (finds URLs; writes nothing) | `claude-haiku-5-5` with the basic web search tool; falls back to Sonnet with the current tool if refused |
| `AI_MODE` | `compare` (default) or `publish` | `compare` |
| `AI_COMPARE` | Compare-mode columns, comma-separated `model:effort` | the 9 Haiku/Sonnet/Opus × low/medium/high settings |

Implementation notes for when the pipeline is built (P2):
- SDK: `@anthropic-ai/sdk`, server-only, in scripts and cron routes.
- Use **structured outputs** (`output_config.format` / `client.messages.parse()` with a zod schema). Assistant prefill is not supported on current models.
- Opus 5.5: thinking is always on. Control depth with `output_config.effort` (default `medium`; set it explicitly). Use streaming for long outputs.
- Opt into server-side refusal fallbacks (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`) and always check `stop_reason` before reading content.
- Use prompt caching for the stable system prompt and source bundle. Use the Batches API (50% cost) for bulk offline enrichment.
- Re-verify model IDs against the live Anthropic docs at implementation time. Do not trust this table blindly.

## 5. Output schema (WRITING_PIPELINE_PLAN.md, owner 2026-10-30)

Defined in `src/lib/ai/schemas.ts` (zod, via `messages.parse` structured output):

```ts
SynthSentence = { text: string; refs: { sourceId: string; excerpt: string }[] }
sections      = { section: <name>; sentences: SynthSentence[] }[]

RaceSynthesis    = { sections }   // context, whyItMatters, whatsAtStake, bigPicture
MeasureSynthesis = { sections }   // summary, yesMeans, noMeans, taxes, cost, money, affected, currentLaw, kind (official sources only)
PersonSynthesis  = {
  education, positions, residence, leftOut,       // lists, checked field by field
  sections,                                        // inBrief, background, priorities, stances
  mightFit:     { issue; text; refs }[],           // up to 4, distinct issues
  timeline:     { when; event; refs }[],
  endorsements: { name; category: "Elected Officials" | "Unions" | "Advocacy & Industry" | "Local Leaders"; refs }[],
}
Rewrite          = { units: { id; text; refs }[] } // the repair pass and the fairness rewrite
NeutralityReview = { flags: { id; reason }[] }
```

- **Campaign funding** is not AI-generated. It is extracted mechanically from Cal-Access/FEC data.
- **Removed:** `strengths`, `criticisms`. **Returned in neutral form (owner, 2026-10-30):** `bottomLine` as In Brief and `voteForIf` as "Might fit if you…" (PRD FR-K4, §14).
- **Balance checks** before storing: the 5 checks above; section parity across a race's candidates; the fairness pass (rewrite, not drop). There is no human approval queue: the checks are the gate.
- `<mark>` placement: the model places 2–3 per prose section; code enforces the rules in `specs/design-system.md` (Highlight system), and `AI_HIGHLIGHTS=off` strips them.

## 6. Cost controls

- Synthesis runs only when the source-set hash changes (`synthesis_runs.input_hash`).
- The extraction model is used for anything that is not prose synthesis.
- Usage is logged per run (`synthesis_runs.metadata.usage`).
- Monthly budget alert (owner action in the Anthropic Console).
