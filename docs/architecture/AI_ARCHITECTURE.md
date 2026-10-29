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
| Targets (registry) and where to look | `src/lib/research/targets.ts` + `src/data/sources/official-guides.json` (statewide measures, retention judges: per-state official pages; candidates: their campaign site from the ballot data) |
| Fetch, hash, run, store | `src/lib/research/run.ts`, run hourly by `/api/cron/research` (`vercel.json`) |
| Verification into the stored shape | `src/lib/research/verify.ts` |
| Read path (curated wins; labeled) | `src/lib/ballot/research.ts`, `researchRead.ts`; `AiLabel` in `src/components/ballot/Citations.tsx` |
| Tables | migrations 0010 (payload/status on `synthesized_field_versions`, `sources.content_text`, `add_api_spend`) and 0011 (public read of published, current rows) |

How one item is made:
1. **Fetch.** The target's pages are fetched through `safeFetch` (public hosts only), plus up to 3 same-site pages linked by expected link text (e.g. "Analysis by the Legislative Analyst", "About", "Issues"). Main text only, stored on `sources`; re-fetched at most daily.
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

Not yet: PDFs (HTML only), local measures (no official list), states other than California in `official-guides.json`, web-search discovery (off until the owner approves it), race context (office duties).

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
| `ANTHROPIC_DEFAULT_MODEL` | Research extraction (measures, judges, candidate profiles) | `claude-haiku-5-5` (owner, 2026-10-29: lowest cost; every answer is quote-checked in code) |
| `ANTHROPIC_EXTRACTION_MODEL` | The quote-support check | same as the default model |

Implementation notes for when the pipeline is built (P2):
- SDK: `@anthropic-ai/sdk`, server-only, in scripts and cron routes.
- Use **structured outputs** (`output_config.format` / `client.messages.parse()` with a zod schema). Assistant prefill is not supported on current models.
- Opus 5.5: thinking is always on. Control depth with `output_config.effort` (default `medium`; set it explicitly). Use streaming for long outputs.
- Opt into server-side refusal fallbacks (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`) and always check `stop_reason` before reading content.
- Use prompt caching for the stable system prompt and source bundle. Use the Batches API (50% cost) for bulk offline enrichment.
- Re-verify model IDs against the live Anthropic docs at implementation time. Do not trust this table blindly.

## 5. Output schema (revised from Phase 5 per PRD §14 / FR-K4)

The output schema has these fields. Every claim carries `sourceIds: string[]` (non-empty):

```ts
type Cited<T> = T & { sourceIds: string[] }        // every item; rendered as inline citation markers

platform:      Cited<{ claim: string }>[]                          // 3–5 main claims ("Proposes…")
background:    Cited<{ text: string }>[]
pastPositions: Cited<{ title; organization; kind: 'elected'|'appointed'|'job'|'nonprofit'|'board'|'military'|'advisory'|'other'; start?; end? }>[]
experience:    Cited<{ text: string }>[]                           // past roles ↔ this office's duties ↔ platform
trackRecord:   { priority: string; actions: Cited<{ text; date? }>[] }[]
priorities:    Cited<{ text: string }>[]
issues:        Record<issueId, Cited<{ stance: string }>>          // "key stances"
history:       Cited<{ year; event }>[]                            // timeline
notableFacts:  Cited<{ text; rule: string }>[]                     // rule-based, e.g. "historic_first"
```

Endorsements are stored as rows (`endorsements` plus a `source_id`), not synthesized text. News items are ingested (Phase 4a), not generated.

- **Campaign funding** is not AI-generated. It is extracted mechanically from Cal-Access/FEC data: totals, the source-type breakdown, the full itemized contributor list, and independent expenditures. The extraction model is used only to parse documents where no API exists.
- **Removed:** `strengths`, `criticisms`, `bottomLine`, `voteForIf`. They remain only in the archived June primary data. `voteForIf`-style matching is reserved for a future membership tier and would be computed from the user's own selections, not generated per candidate.
- **Balance checks** run before publish:
  - section and length parity across candidates in a contest;
  - a banned-phrasing lint (evaluative adjectives, "should", "best", rankings, predictions, "critics say" without a named source);
  - human review for any contest that fails parity.
- `<mark>` placement (CLAUDE.md design rule) is limited to factual anchors (dates, amounts, office names, measure numbers), pending PRD Open Question 3.

## 6. Cost controls

- Synthesis runs only when the source-set hash changes (`synthesis_runs.input_hash`).
- The extraction model is used for anything that is not prose synthesis.
- Usage is logged per run (`synthesis_runs.metadata.usage`).
- Monthly budget alert (owner action in the Anthropic Console).
