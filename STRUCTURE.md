# ballot.ai — page hierarchy & terminology

This file is a single source of truth for the names and structure of every visible piece of the ballot page. **Update it with every UI change** — when an element is added, removed, renamed, or significantly restyled, edit this file in the same commit. AI assistants and humans both reference this when discussing the page.

When the user says "the section header", "the toolbar", "the first column", etc., it should be unambiguous which element they mean. If you find yourself uncertain, the answer is here.

---

## Top-level layout

```
PAGE  (route: /ballot/[zip]/[electionId])
├── SIDEBAR     (left, sticky full-height, hidden below lg breakpoint)
└── MAIN COLUMN (right, scrollable; max-w-1400)
```

Implementation: `<div class="flex">` with `<aside>` (sidebar) + `<main>` as flex children.

---

## Sidebar

```
SIDEBAR
├── SITE HEADER
│     ├── brand           ("ballot.ai" — display serif, ".ai" muted)
│     ├── location        (city, state · ZIP — accent eyebrow)
│     ├── election        (name + date)
│     └── quick actions   (Top button — disabled until scrolled; Change link → "/")
│
├── RACE NAV  (scrollable)
│     └── RACE NAV ITEM × N
│           ├── race row              (number + office + active count + chevron)
│           │     • Highlighted via `bg-ink-2 text-paper` when scroll-spy
│           │       has this race active AND no candidate in this race is the
│           │       active candidate (race highlight is suppressed in favor
│           │       of the more specific candidate highlight when both apply).
│           │     • Expanded (dropdown shown) on hover OR when scroll-spy active.
│           └── candidate dropdown    (animated grid-template-rows expand)
│                 └── CANDIDATE LINK × N
│                       • Highlighted via `bg-ink-2 text-paper` + `aria-current="true"`
│                         when an `<article id="candidate-...">` is the most-visible
│                         element on screen (IntersectionObserver in Sidebar).
│                       • Includes a polling % stat colored by trend
│                         (up=green, flat=gray, down=red, suspended="susp.").
│
└── FOOTER  ("Live data · N races")
```

Scroll-spy:
- **Race scroll-spy**: one observer per `<section id="race-{id}">`, picks the highest visible-ratio race.
- **Candidate scroll-spy**: one shared observer over every `<article id="candidate-{race}-{cand}">`, picks the highest visible-ratio candidate. Used to highlight in the candidate dropdown.

---

## Main column

```
MAIN COLUMN
├── COVER             (top-of-page hero)
└── RACE SECTION × N
```

### Cover

```
COVER  (<header> in ballot page)
├── eyebrow                  ("A guide to your ballot")
├── h1                       ("Voter's Guide")
├── tagline paragraph        ("Every race, every candidate…")
├── election name (h2 italic light) + date
├── location                 (font-mono-cap text-[15px] paper-2 — primary city/ZIP)
├── districts                (font-mono-cap text-[11px] paper-4 — county + district codes,
│                             tight `mt-1` so it reads as a sub-line of location)
└── stats row                (Races on your ballot · Active candidates · UpdateBar)
```

The tagline paragraph sits **between** the h1 and the election name + location pair — election + location is the secondary identifier, placed just above the stats so they share the same data-eyebrow zone.

Districts label format: `{County} County · CA-{us_house} · AD-{state_assembly} · SD-{state_senate} · BOE-{boe}` — only includes parts that are present in the jurisdiction record.

### Race section

```
RACE SECTION  (<section id="race-{id}" class="scroll-mt-4">)
├── RACE HEADER          (the per-race <header> at the top)
├── COMPARISON SECTION
└── PROFILES SECTION
```

#### Race header

```
RACE HEADER  (<header> with pt-16, border-b)
├── index strip           ("01" + jurisdiction)
├── RACE OFFICE           (h2 — e.g. "Governor of California")
├── format block          (format tag + format explainer + active-candidate count)
├── meta strip            (Term · Salary · Vacancy · Last Winner)
├── INTRO GRID            (2-col 12-grid: Context, Why it matters, What's at stake,
│                          Big picture, Polling, Suspended list)
└── RACE NEWS FEED        (single-row carousel)
```

#### Comparison section

```
COMPARISON SECTION  (<section class="mt-16">)
├── STICKY GROUP        (sticky top:0 z:100 bg-ink-0 pt-8)
│     ├── EYEBROW ROW   (flex justify-between; eyebrow on left, action group on right —
│     │                  mirrors the candidate-profiles section's eyebrow + Expand/Collapse pattern)
│     │     ├── eyebrow         ("Side-by-side" + Info tooltip explaining what's compared)
│     │     └── action group    (Show all / Hide all / Reset — paper-3, hover accent)
│     │   • mb-8 below the row (matches news + profile spacing)
│     └── TOOLBAR CHROME  (bg-ink-0 + border + rounded-t-lg)
│           ├── chips row     (chips on left + microcopy on right)
│           │   • chips: drag to reorder, click to toggle visibility
│           │   • microcopy: "Drag to reorder · Click to toggle" — paper-4 muted info,
│           │     vertically centered with the chips block
│           ├── divider       (border-t inside toolbar)
│           └── thead strip   (column-header table; overflow-hidden, scrollLeft synced to body)
│                 ├── ISSUE COL HEADER  (sticky-left, z:20, glass-tier,
│                 │                      ::after gridline at right edge)
│                 └── CANDIDATE COL HEADERS  (300px each: name + jump-to-profile +
│                                             party pill + polling pill)
└── BODY  (overflow-x-auto, rounded-b-lg + border-t-0)
      └── tbody table with alternating row bg-ink-0 / bg-ink-1
            ├── FIRST COLUMN     (sticky-left, z:10, ::after gridline at right edge —
            │                     issue label per row)
            └── candidate cells  (one per visible candidate, content rendered as RichText)
```

Notes:
- The sticky-left "first column" exists in both the thead (Issue header) and tbody (issue labels). It freezes at left:0 during horizontal scroll. Its right gridline is a `::after` pseudo-element so it's not subject to `border-collapse` or `overflow:hidden` clipping.
- The body has its own horizontal scrollbar; JS keeps the thead's `scrollLeft` synced to it so columns line up.

#### Profiles section

```
PROFILES SECTION  (<section class="mt-20">)
├── SECTION HEADER  (sticky top:0 z:100, pt-8 pb-8 — matches the comparison
│                    eyebrow's `mb-8` so the visual gap between the eyebrow
│                    and the next content (profile list here, toolbar there)
│                    is identical.
│                    Two-layer structure:
│                      • BG LAYER  (absolute inset-0 -z-10 pointer-events-none)
│                        — bg = `color-mix(in oklch, var(--color-ink-0) 88%, transparent)`
│                          (page-color base so the sticky blends into the page
│                          rather than reading as a lighter raised block);
│                        — `backdrop-filter: blur(14px) saturate(140%)` for
│                          subtle tint pickup from content behind;
│                        — bottom edge softened via a multi-stop gradient mask:
│                          `linear-gradient(to bottom, black 0%, black 60%, rgba(0,0,0,0.65) 78%, rgba(0,0,0,0.25) 92%, transparent 100%)`
│                          (top 60% opaque, then drops through 78% / 92% / 100%).
│                      • CONTENT LAYER (in-flow eyebrow + Expand/Collapse)
│                        — renders on top of the bg layer, NOT masked, so
│                          the Info tooltip popup that extends below the
│                          icon stays fully visible instead of getting
│                          clipped by the bg's fade.)
│     ├── EYEBROW       ("Candidate profiles" + Info tooltip explaining coverage)
│     └── controls      (Expand all / Collapse all — same line as eyebrow, right-aligned)
└── PROFILE LIST  (space-y-5)
      └── PROFILE ARTICLE × N  (<article id="candidate-{race}-{cand}" class="scroll-mt-32">)
            ├── PROFILE HEADER  (the toggle <button>, NOT sticky; px-7 py-7 sm:px-8 sm:py-8)
            │     ├── headshot      (left)
            │     ├── identity      (name h3 text-[20px] · party pill · polling pill · current role)
            │     └── chevron       (rotates 180° when open)
            └── PROFILE BODY  (collapsible via grid-template-rows;
                  padding `px-7 pb-7 sm:px-8 sm:pb-8` — bottom matches left/right;
                  content's pt comes from the first inner section's pt-8)
                  ├── BACKGROUND + PAST POSITIONS  (2-up; past-positions in a callout)
                  ├── KEY PILLARS                  (4-up: Priorities, Stances, Strengths, Criticisms;
                  │                                 each with its own tint and tooltip)
                  ├── TIMELINE                     (eyebrow + Info tooltip + L/R arrows;
                  │                                 horizontal scroll list with edge fades;
                  │                                 most recent leftmost; pre-cycle events
                  │                                 rendered at opacity-40)
                  ├── ENDORSEMENTS                 (columns by category)
                  ├── PROFILE NEWS FEED            (single-row carousel)
                  ├── "VOTE FOR X IF…"             (4-up tiles; large oldstyle numerals)
                  └── BOTTOM LINE                  (rounded-xl callout with eyebrow + body)
```

Suspended candidates render a reduced PROFILE BODY: red status pill, suspension note callout, background, timeline, news only.

---

## Vocabulary cheat-sheet

| Term                       | Refers to                                                       |
| -------------------------- | --------------------------------------------------------------- |
| **Sidebar**                | The full-height left rail.                                      |
| **Main column**            | Everything to the right of the sidebar.                         |
| **Cover**                  | The top-of-page `<header>` with "Voter's Guide".                |
| **Race section**           | One `<section id="race-...">` — wraps everything for one race.  |
| **Race header**            | The `<header>` at the top of a race section (race office, intro grid, etc.). |
| **Race office**            | The h2 with the office name ("Governor of California").         |
| **Comparison section**     | The "Side-by-side" `<section class="mt-16">` and its body table. |
| **Profiles section**       | The "Candidate profiles" `<section class="mt-20">` and its profile list. |
| **Sticky group**           | The pinned-at-top wrapper inside a section. Comparison's sticky group includes the toolbar; profiles' sticky group is just eyebrow + controls. |
| **Section header**         | Inside a section's sticky group: the eyebrow row(s). For profiles: eyebrow + Expand/Collapse. |
| **Toolbar**                | Inside the comparison sticky group: chips + microcopy + Show/Hide/Reset + thead. |
| **Eyebrow**                | The mono-cap small-text label with an icon ("Side-by-side", "Candidate profiles", "Timeline", "In the news"). |
| **First column**           | The leftmost column of the comparison table (sticky-left). Applies to both thead and tbody. |
| **Profile article**        | One `<article id="candidate-...">` — wraps one candidate's full profile. |
| **Profile header**         | The toggle `<button>` at the top of a profile article (headshot + name + chevron). |
| **Profile body**           | The collapsible content inside a profile article (background, pillars, timeline, news, vote-for-if tiles, bottom line). |
| **Bottom line**            | The final rounded-xl callout in a profile body. |

---

## Sticky / z-index map

| Layer            | Element                                       | Stickiness      | z-index |
| ---------------- | --------------------------------------------- | --------------- | ------- |
| 100              | Comparison sticky group                       | top:0           | z-[100] |
| 100              | Profiles sticky group                         | top:0           | z-[100] |
| 30               | Pillar tooltip popup                          | absolute        | z-30    |
| 20               | Issue col (thead first cell)                  | sticky left:0   | z-20    |
| 10               | First column (tbody)                          | sticky left:0   | z-10    |
| 10               | Timeline bullet                               | relative        | z-10    |
| auto             | Sidebar                                       | sticky top/left | auto    |

---

## Scroll-margin offsets (for sidebar nav anchors)

| Target                                       | Class           | Offset |
| -------------------------------------------- | --------------- | ------ |
| `<section id="race-...">`                    | `scroll-mt-4`   | 16px   |
| `<article id="candidate-...">`               | `scroll-mt-32`  | 128px (clears the profiles sticky header at ~96px) |

---

_Last updated: 2026-05-07_
