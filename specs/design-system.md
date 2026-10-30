# Design system spec

## Palette

All colors are OKLCH. Defined as CSS custom properties in `src/app/globals.css`.

### Backgrounds (ink scale)
| Token | Value | Use |
|---|---|---|
| `--color-ink-0` | `oklch(11.5% 0.003 70)` | Page background |
| `--color-ink-1` | `oklch(15% 0.003 70)` | Card surface |
| `--color-ink-2` | `oklch(18.5% 0.003 70)` | Raised element |
| `--color-ink-3` | `oklch(24% 0.004 70)` | Border |
| `--color-ink-4` | `oklch(34% 0.005 70)` | Divider / hover border |

Chroma is held near 0.003 — warm enough to avoid cold-blue, but never reading as a yellow tint. **Never raise chroma on card/table/profile backgrounds.**

### Text (paper scale)
| Token | Use |
|---|---|
| `--color-paper` | Primary text — soft ivory |
| `--color-paper-2` | Secondary text |
| `--color-paper-3` | Tertiary (e.g. `.ai` in brand logo) |
| `--color-paper-4` | Quaternary / muted labels |

### Accent (golden yellow)
| Token | Use |
|---|---|
| `--color-accent` | `oklch(80% 0.155 82)` |
| `--color-accent-soft` | 22% opacity — subtle bg tint |
| `--color-accent-mute` | 10% opacity — hover states |
| `--color-accent-deep` | Darker variant for headings |

**Hard rule:** Yellow accent is ONLY for `<mark>` highlights, section eyebrow icons, hover states, and the polling rail. Never as a card/table/profile background tint.

### Party colors
**Hard rule:** Red and blue are reserved EXCLUSIVELY for Republican and Democratic party encoding. Never use for status, errors, links, or anything else.

| Token | Party |
|---|---|
| `--color-dem` / `--color-dem-soft` | Democratic |
| `--color-rep` / `--color-rep-soft` | Republican |
| `--color-grn` / `--color-grn-soft` | Green |
| `--color-lib` / `--color-lib-soft` | Libertarian |
| `--color-lib` amber is hue 60, distinct from the yellow accent (hue 82) | |
| `--color-np` / `--color-np-soft` | Every other party, independents, no party preference, nonpartisan |

**Standard (owner, 2026-10-29):** a party gets its own color only when it is as strongly tied to one as red and blue are to Republicans and Democrats. Today that is Green (green) and Libertarian (gold). Every other party (Peace and Freedom, American Independent, Constitution, Working Families, Conservative, Forward, Alaskan Independence…) is neutral gray, and the pill always prints the party exactly as the ballot data names it (`Candidate.partyName`). Party is never shown by color alone.

### Citations and sources (Nov 3 ballot)
- **One Sources block per block that makes claims**: each race header, each measure card, each candidate profile ends with its own Sources block. Inline markers point into that block's list; numbering restarts per block.
- **[n] footnote popovers** (owner, 2026-10-29): every cited item gets a marker, even when the block has one source.
  - **Opening:** hover, keyboard focus or a tap opens a card (`src/components/ballot/CiteMarker.tsx`). Escape or tapping elsewhere closes it.
  - **The card:** the exact supporting sentence in italics (for researched items), "publisher: title" with a link, then "Official source ·" and the accessed date. For written prose, each sentence has its own markers, and each card shows that sentence's excerpt from that source (WRITING_PIPELINE_PLAN.md).
  - **Never inline:** the quote never appears in the text itself.
  - **Mechanics:** the same hover/focus-within pattern as the district map note (`MapYearInfo`), so the link stays reachable. The trigger's tap area is enlarged to about 24px.
- **Profiles** (owner, 2026-10-30; PRD FR-K4), in this order, every item cited:
  1. **In Brief:** the Bottom Line callout (`rounded-xl bg-ink-0 border`, Sparkles eyebrow), 2–3 sentences in serif display type. The AI label sits just above it.
  2. **Background** (never "Bio"): narrative prose, a marker per sentence; **Education** under it, one code-written line per degree, e.g. "J.D., Stanford Law School · 1984".
  3. **Past Positions** (the gray callout beside Background): newest first, `Title (years)` with the district written out, e.g. "U.S. Secretary of Health and Human Services (2021–2025)". Chairs get their own line; a smaller "Committees: …" line goes under the position.
  4. **Key Priorities | Key Stances:** 2 pillar columns of short noun phrases (no "Says…", no topic label in front); each eyebrow keeps its ⓘ tooltip (`PILLAR_TOOLTIPS`), which does the attribution.
  5. **Endorsements:** 2 rows of 2 (Elected Officials | Unions, then Advocacy & Industry | Local Leaders), named and cited.
  6. **Might fit if you…:** the June numbered-card list (`no-highlights`), with an ⓘ (MapYearInfo pattern) reading "These lines pair this candidate's own stated positions with priorities a voter might hold. They cover the four issues the candidate emphasizes most in their own materials. ballot.ai does not recommend or rank candidates." Never highlighted.
  7. **Timeline**, then Campaign funding, In the news, Sources.
  - A researched section the sources don't support says "Limited documented information in reviewed sources" (italic, `paper-3`); one not researched yet says "Being researched".
- **Race header order** (2026-10-29): intro grid ("The office" first, full width, then Context / Why it matters / What's at stake / The big picture), then the race's Sources block, then "In the news". Sources sit above the news so they stay with the claims they back.
- **"The office"**: same eyebrow shape as the other intro blocks. It shows the duties paragraph, then one row "Term · Seats · Salary" (salary only when an official page states it). Every item is cited and carries the AI label when it came from the research job. Until then it shows "Being researched…", which fills in live without a reload.
- **Race and measure blocks start with "Ballot data:"** (official source · via conduit · retrieved time), then any rule source ("Vote needed: …"), then the researched sources. Candidate profiles skip the ballot-data line (the race block covers the listing).
- **Every cited item gets a numbered `[n]` marker, even with one source** (owner, 2026-10-29; supersedes the earlier "one source → no markers" rule).
- Side-by-side cells link their source directly.

### Vote needed and measure questions
- Every race shows what it takes to win on its count line ("Vote for 1 of 2 candidates · Most votes wins"); every measure shows "Passes with …" naming the share **and its base** ("of the votes cast on this measure" / "of all ballots cast in the election"). Unverified rules say so; never guessed (`src/domain/voteNeeded.ts`).
- Measures carry "What it means for you": the same six questions, same order, on every measure (`src/lib/ballot/measureImpact.ts`), answered only from official nonpartisan analyses, cited; unanswered → "Not addressed in the official analysis". No green/red for Yes/No.
- Measure card header: title block left, jurisdiction right (wraps under the title on narrow screens). "Passes with …." is a plain sentence in the summary's type style, right after the summary.
- Judicial retention (Yes/No on one judge) renders as a measure-style card (`RetentionCard`), grouped after the races under "Judges up for retention": official question, "Retained if …", what Yes/No mean, a cited "About the judge", one Sources block. No comparison table or candidate profile.
- District names drop the provider's map year ("19th Assembly District - 2022" → "19th Assembly District"); an ⓘ tooltip explains which map it is from the cited registry `src/data/official/district-maps.json` (what changed, when, end date only if the law sets one). Unlisted years say only "District lines from the map labeled YYYY in the official ballot data."

### Supplementary tints
Used for data encoding (section pillars, news item types) — never as primary surface backgrounds.

| Token | Use |
|---|---|
| `--color-tint-orange` | Priorities pillar |
| `--color-tint-teal` | Stances pillar, news items |
| `--color-tint-green` | Endorsements (Advocacy & Industry); the June Strengths pillar |
| `--color-tint-pink` | Criticisms pillar |
| `--color-tint-purple` | Social posts |

### Trend signals
| Token | Use |
|---|---|
| `--color-trend-up` | Polling up |
| `--color-trend-down` | Polling down — muted red, **distinct from `--color-rep`** |

---

## Typography

IBM Plex stack. Three weights of use:

| Class | Font | Use |
|---|---|---|
| `font-sans` (default) | IBM Plex Sans | Body, UI, labels |
| `font-display` | IBM Plex Serif | Candidate names, race titles, hero headings |
| `font-mono-cap` | IBM Plex Mono + uppercase + tracking | Section eyebrows (11px, `tracking-[0.16em]`) |

`font-display` uses: `font-feature-settings: "kern", "liga", "calt", "ss01"` and `letter-spacing: -0.018em`.

`font-mono-cap` is used for all three section eyebrows ("In the news" / "Side-by-side" / "Candidate profiles") — they must all share the same shape: `font-mono-cap text-[11px] text-paper + lucide icon size=12 className="text-accent" + tracking-[0.16em]`. Profile section eyebrows (In Brief, Background, Past Positions, Endorsements, Might fit if you…, Timeline) use the same shape at icon size 13.

---

## Writing style (owner, 2026-10-30)

ballot.ai's own words follow the **AP Stylebook**, with these house exceptions, which win over AP:
- **Numerals always**, including 1–9 ("3 candidates"). Rephrase rather than start a sentence with a number.
- **Percent is always "%".**
- **The Oxford comma always.**

AP otherwise: state names abbreviated AP-style only after a city ("Fresno, Calif."); titles capitalized before a name, lowercase after ("Gov. Jerry Brown", "Brown, the governor"); AP dates and times ("Nov. 3", "May 5, 2026").

**Cited vs uncited (owner, 2026-10-30):** like a nonpartisan news outlet, claims and positions are cited and attributed; explanation around them (how an office works, connecting sentences) may be uncited, carries no [n], adds no specific fact, and stays descriptive, symmetric and in plain common terms. No generic filler: a sentence true of any race doesn't belong.

Voice (from the June prototype, minus its evaluative framing): lead with the most important fact; be concrete (numbers, dates, named programs); connect facts ("which means…", "because…") only when the sources do; 2–4 sentences per section; plain words a 9th grader can follow; attribute claims ("His campaign says…", "The Legislative Analyst estimates…"). Never "surged", "struggled", "frontrunner", "fractured", "establishment", "elites", strengths or criticisms, or rankings. In the writing pipeline, code flags common AP slips (`apSlips`, `src/lib/research/synthesis.ts`) and the repair pass fixes them; a sentence is never dropped for style.

---

## Highlight system (`<mark>`)

Highlights are solid-fill with rounded corners. Color is driven by CSS custom properties that cascade from ancestor wrappers:

```css
:root { --mark-h: 80% 0.155 82; } /* default: yellow */
.hl-section-good   { --mark-h: 74% 0.13 155; } /* green — strengths */
.hl-section-warn   { --mark-h: 75% 0.13 50;  } /* orange — priorities */
.hl-section-info   { --mark-h: 76% 0.10 200; } /* teal — stances */
.hl-section-danger { --mark-h: 76% 0.13 350; } /* pink — criticisms */
.hl-section-note   { --mark-h: 74% 0.13 295; } /* purple */
```

`autoHighlight()` in `Highlight.tsx` runs at render and marks: statistics/percentages, ballot measure references, named CA policies, and superlatives. Manual `<mark>` tags pass through unchanged.

Nov 3 surfaces pass `auto="neutral"`: only structural facts (amounts, percentages, counts, vote thresholds, dates, measure numbers).

**Written prose** (writing pipeline, owner 2026-10-30): the model wraps 2–3 load-bearing phrases per section in `<mark>`; code enforces (`shapeSections`, `trimMarksToParity` in `src/lib/research/synthesis.ts`):
- at most 3 per prose section;
- a list highlights every item or none;
- every candidate in a race gets the same count per section, within 1;
- no evaluative word inside a highlight;
- never a measure's own name or number;
- "Might fit if you…" is never highlighted.

A mark that breaks a rule is stripped (the sentence stays). The neutrality reviewer also reviews highlights. `AI_HIGHLIGHTS=off` strips every mark at read time. A later workshop turns the owner's marked example paragraphs into rules and tests.

---

## Sticky pattern

All sticky elements sit at `top-0` with internal `pt-8` padding for breathing room. Each sticky element needs a gap shield — a `::before` pseudo-element that paints the page background behind the 16px gap, preventing body content from peeking through while scrolling.

**Comparison section** (eyebrow + chip toolbar + table header):
```
sticky top-0 z-[100] bg-[var(--color-ink-0)] pt-8
```

**Candidate profiles section** (eyebrow + expand/collapse controls):
```
relative sticky top-0 z-[100] pt-8 pb-8
```
Translucent/masked background is an absolute layer behind the controls.

**Individual candidate headers**: not sticky. Each `<button>` scrolls with its `<article>`.

**Sidebar**: `sticky top-0 left-0 h-screen`.

---

## Card surfaces

- Cards use `bg-[var(--color-ink-1)]` — never add chroma or yellow tint
- Raised elements use `bg-[var(--color-ink-2)]`
- `glass-tier`: `color-mix(in oklch, var(--color-ink-1) 88%, transparent)` + `backdrop-filter: blur(14px) saturate(140%)` — used for profile section background mask

---

## Utilities

- `.font-display` — IBM Plex Serif with optical kerning
- `.font-mono-cap` — IBM Plex Mono, uppercase, wide tracking
- `.glass-tier` — frosted glass surface
- `.drop-cap` — serif drop cap with accent color
- `.rule-double` — double-line divider
- `.scrollbar-hide` — hide scrollbar (carousels)
- `.race-number` — tabular nums + slashed zero

---

## Status / suspended candidates

Suspended candidates render with a **red** status pill. Not yellow, not orange — red, using `--color-rep` tone. This is the one place red is not party-encoding; it's a distinct `StatusPill` variant.

---

## Focus / accessibility

```css
*:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
  border-radius: 2px;
}
```

Reduced motion: all animations disabled via `@media (prefers-reduced-motion: reduce)`.
