# AI Architecture

> Product rules: [PRD §13–14](../product/PRD.md#13-ai-strategy) · Prior synthesis plan: [`specs/phase-5-synthesis.md`](../../specs/phase-5-synthesis.md)

## 1. Audit (2026-10-28)

The application has **no Anthropic integration today**. There is no SDK dependency, no API route, no prompts, and no model IDs in code. The only traces are:
- a commented `ANTHROPIC_API_KEY` in `.env.example`;
- the 0003 tables `synthesis_runs` and `synthesized_field_versions`, which have `model` and `prompt_version` columns but are unused;
- the Phase 5 spec, which plans Perplexity Sonar for research and Claude for writing, cron- and event-driven, with no model ID chosen.

There are therefore no deprecated models to migrate. Centralized configuration is introduced from the start.

**Claude Code vs. runtime:** Claude Code authentication is separate from ballot.ai's runtime `ANTHROPIC_API_KEY`. Development sessions never need the production key.

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
| `ANTHROPIC_DEFAULT_MODEL` | Higher-capability synthesis: candidate summaries, measure explanations, comparisons | `claude-opus-5-5` |
| `ANTHROPIC_EXTRACTION_MODEL` | High-volume low-cost extraction, classification, normalization | `claude-haiku-5-5` |

Implementation notes for when the pipeline is built (P2):
- SDK: `@anthropic-ai/sdk`, server-only, in scripts and cron routes.
- Use **structured outputs** (`output_config.format` / `client.messages.parse()` with a zod schema). Assistant prefill is not supported on current models.
- Opus 5.5: thinking is always on. Control depth with `output_config.effort` (default `medium`; set it explicitly). Use streaming for long outputs.
- Opt into server-side refusal fallbacks (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`) and always check `stop_reason` before reading content.
- Use prompt caching for the stable system prompt and source bundle. Use the Batches API (50% cost) for bulk offline enrichment.
- Re-verify model IDs against the live Anthropic docs at implementation time. Do not trust this table blindly.

## 5. Output schema (carried from Phase 5, revised for neutrality)

Kept: `background`, `priorities[]`, `issues: Record<issueId, {stance, sourceIds[]}>`, `history[]`. Each claim carries `sourceIds`.

**Dropped from new surfaces** (neutrality, PRD §14): `strengths`, `criticisms`, `voteForIf`, `bottomLine`. They remain in the archived June primary data only.

`<mark>` placement (CLAUDE.md design rule) is limited to factual anchors (dates, amounts, office names, measure numbers) pending PRD Open Question 3.

## 6. Cost controls

- Synthesis runs only when the source-set hash changes (`synthesis_runs.input_hash`).
- The extraction model is used for anything that is not prose synthesis.
- Usage is logged per run (`synthesis_runs.metadata.usage`).
- Monthly budget alert (owner action in the Anthropic Console).
