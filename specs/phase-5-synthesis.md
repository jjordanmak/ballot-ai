# Phase 5 — AI synthesis spec

## Goal
Replace seeded/hand-authored candidate profile content with AI-synthesized, source-grounded content. Every profile field is written by Claude from Perplexity-researched sources and stored in the DB. Updates are cron-driven and event-triggered — never on user request.

---

## Model architecture

**Perplexity Sonar** handles research. **Claude** handles writing.

### Why two models
- Perplexity is purpose-built for real-time grounded web research with citations. One API call per candidate retrieves current facts from Wikipedia, Ballotpedia, campaign sites, and news — without maintaining per-site scrapers.
- Claude is better at structured JSON output, consistent editorial voice, and `<mark>` placement. Perplexity's output can bleed inline citation markers (`[1][2]`) and doesn't reliably follow complex output schemas.

Each model does what it's best at. The pipeline is not significantly more complex than using one model for both.

---

## Synthesis flow

Uses the `material_events` → `synthesis_runs` → `synthesized_field_versions` tables from migration `0003`.

```
1. Trigger (cron or material_event detected)
        ↓
2. Create synthesis_run row (status: queued)
        ↓
3. Perplexity Sonar query per candidate
   → Upsert sources + source_evidence_links
        ↓
4. Claude synthesis call
   Input:  Perplexity research + existing DB fields + system prompt
   Output: JSON with all profile fields, <mark> tags inline
        ↓
5. Write synthesized_field_versions (is_current = true)
   Update candidates row with new field values
   Mark synthesis_run succeeded
        ↓
6. ISR picks up changes within 5 min
```

---

## Perplexity research query

One query per candidate. Prompt structure:
```
Research [Candidate Name], candidate for [Office] in the [Election] election.
Return: current position/role, political background, top policy priorities,
stated positions on key issues, notable strengths, common criticisms,
political history timeline, major endorsements, polling context.
Include source URLs for all claims.
```

The response populates `sources` (one row per URL cited) and `source_evidence_links` (mapping each source to the candidate field it supports).

---

## Claude synthesis call

### System prompt (summary)
- Write in a neutral, factual, civic voice — no spin, no partisan framing
- Use only the provided research sources — no hallucination
- Wrap 2–3 load-bearing phrases per text field in `<mark>` tags
- Output strict JSON matching the candidate schema

### Output schema
```typescript
{
  background: string,          // 2–4 sentences, may contain <mark>
  priorities: string[],        // 3–5 items, each may contain <mark>
  stances: string[],           // one per issue, may contain <mark>
  strengths: string[],         // 3–5 items
  criticisms: string[],        // 3–5 items
  history: { year: string, event: string }[],
  voteForIf: string[],
  bottomLine: string,          // 1–2 sentences
  issues: Record<string, { stance: string, source?: string }>
}
```

### `<mark>` guidelines for the prompt
- 2–3 per text field — not every sentence
- Mark load-bearing phrases: the thing that most defines this candidate's position or record
- Examples: "establishment Democrat with the deepest résumé", "supports single-payer healthcare", "raised $12M in Q1"
- Don't mark generic filler

---

## Triggers for re-synthesis

### Scheduled (cron)
| Field group | Cadence |
|---|---|
| Background, past roles | Monthly during cycle |
| Priorities, stances, strengths, criticisms | Weekly during cycle; daily in last 30 days |
| Endorsements | Daily |
| History timeline | Daily |

### Event-triggered (material_events)
The synthesis pipeline re-runs a candidate's fields when any of these events are detected:
- `campaign_suspension` — re-synthesize strengths/criticisms/bottom_line
- `withdrawal` — mark candidate as withdrawn, hide from ballot view
- `stance_change` — re-synthesize stances + issues
- `endorsement` — re-synthesize endorsements
- `poll_shift` — update polling_pct, trend, polling_status
- `major_news` — re-synthesize bottom_line

Material events are detected by the ingestion cron (change in source content hash) or manual admin entry.

---

## Candidate coverage rules
Synthesis runs only for candidates meeting coverage criteria:
- Qualified for any official debate, OR polled ≥ 3% in any verified poll, OR raised ≥ $50K, OR is a major-party nominee

---

## Update button integration
Once Phase 5 is live, apply:
- Rate-limit: 1 refresh per 60s per session
- `revalidatePath('/ballot/[zip]/[electionId]')` on the server action instead of just `router.refresh()`

---

## Environment variables needed
```
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=
```

---

## Definition of done
- [ ] Perplexity research query returns cited facts for Governor candidates
- [ ] Claude writes all profile fields with `<mark>` tags from Perplexity research
- [ ] `synthesized_field_versions` row written with `is_current = true`
- [ ] Ballot page displays synthesized content within one ISR cycle
- [ ] Scheduled cron running for at least one field group
- [ ] At least one material_event type (e.g. endorsement) triggers re-synthesis
