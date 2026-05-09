# Ballot view spec

Route: `/ballot/[zip]/[electionId]`

The ballot view is a single long-scroll page. The sidebar is fixed left. The main content area scrolls and contains one section per race.

---

## Page structure

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (sticky, full height, left)                │
├─────────────────────────────────────────────────────┤
│  Cover (election title, date, location, stats)      │
│  ─────────────────────────────────────────────────  │
│  [Race section × N]                                 │
│    Race header                                      │
│    News feed (carousel)                             │
│    Side-by-side comparison (sticky toolbar + table) │
│    Candidate profiles (sticky eyebrow + cards)      │
└─────────────────────────────────────────────────────┘
```

---

## Sidebar

**Component:** `Sidebar.tsx`

### Brand header
- Renders as: `ballot` + `<span className="text-paper-3">.ai</span>` — lowercase, `.ai` in gray
- Below brand: location (city/ZIP), election name, election date

### Race navigation
- One `<li>` per race, with race office name
- **Scroll-spy**: `IntersectionObserver` on each `#race-{id}` section drives the active highlight
- **Dropdown**: expands on hover (`onMouseEnter` / `onMouseLeave`) — independent of scroll-spy. Both hover AND scroll-spy active can be true simultaneously; collapse only when neither is true
- When a candidate profile is in view, the sidebar highlights that candidate in the race dropdown (candidate scroll-spy)
- Race row highlight is suppressed when a candidate within that race is the active item

### Controls
- **"Top" button**: always visible — disabled (muted gray) when already at top, enabled when scrolled
- **"Change" button**: `<Link href="/">` — navigates back to landing for ZIP/election re-pick

---

## Cover

Shown at the top of the ballot page, above the race sections.

- Election name (large, serif display)
- Election date
- Location: two lines — city/ZIP on first, county + district codes on second (font-mono-cap, 13px, `--color-paper-2`)
- Tagline paragraph above election info
- Race count stat

---

## Race header

**Component:** `RaceHeader.tsx`

Per race, shows:
- Office name + jurisdiction label
- Format + format explainer (e.g. "Top-Two Open Primary — The top two vote-getters...")
- Candidate count (shown below the format explainer)
- Meta strip: term length, salary, etc.
- Context + whyItMatters + bigPicture + whatsAtStake paragraphs
- Polling card (if polling data exists): bar chart per candidate, source link, trend arrows
- Suspended candidates list (if any): red status pill, name, party dot, suspension note

---

## News feed

**Component:** `NewsFeed.tsx`

- Horizontal carousel with CSS `mask-image` fade on both edges (no overlay gradient)
- Items: news articles, social posts (platform-faithful embed style), polls, endorsements
- Item types distinguished by tint color and icon:
  - `news` → teal
  - `social` → purple
  - `poll` → orange
  - `endorsement` → green
- Social posts show platform glyph, handle, avatar, text, optional media, optional engagement counts
- Empty state: mono text, two lines
- Realtime: `NewsFeed` subscribes to Supabase Realtime on mount, appends new `news_items` rows to the carousel without a page reload

---

## Comparison table (Side-by-side)

**Component:** `ComparisonTable.tsx`

### Sticky group
The eyebrow, chip toolbar, and table header pin together as one opaque unit:
```
sticky top-0 z-[100] bg-[var(--color-ink-0)] pt-8
```

### Toolbar (inside sticky group)
- Section eyebrow: `font-mono-cap text-[11px]` + `Columns3` icon (accent, size 12)
- Candidate chip row: one chip per active candidate — click toggles visibility, drag reorders
- Show all / Hide all controls (next to eyebrow, not in the chip row)
- Microcopy: "Drag to reorder · Click to toggle" (shown at all breakpoints)
- Reset button: restores original order and visibility

### Table
- First column: frozen (row label) — implemented via `::after` pseudo-element box-shadow to avoid `overflow:hidden` / `border-collapse` issues
- Body horizontally scrollable; header syncs `scrollLeft` to body via scroll event
- Rows: issues (stances), polling, endorsements, background highlights
- Empty cells use a fallback descriptor from the issue definition
- Withdrawn and suspended candidates excluded from the table

### Visibility logic
- When > 5 active candidates: only `candidate.major = true` are visible by default
- Otherwise: all active candidates visible
- User state (order + visibility) is local — resets on page reload

---

## Candidate profiles

**Component:** `CandidateProfile.tsx`

### Sticky group (section level)
The eyebrow and expand/collapse controls pin together:
```
relative sticky top-0 z-[100] pt-8 pb-8
```
Background is a translucent/masked absolute layer — tooltips and popups render above it.

### Section eyebrow
`font-mono-cap text-[11px]` + `Users` icon (accent, size 12) — matches the "In the news" and "Side-by-side" eyebrow shape exactly.

### Individual profile cards
Each candidate has a collapsible `<article>`:
- **Header** (`<button>`): name, party dot + label, `currentRole`, `pollingStatus`, trend arrow, suspended pill if applicable. Scrolls with the article — not sticky.
- **Suspended candidates**: start collapsed; render red status pill; content is reduced
- **Active candidates**: start expanded

### Profile sections (pillars)
Each pillar uses a supplementary tint for its eyebrow icon AND scopes `<mark>` highlight color via an `hl-section-*` wrapper:

| Section | Tint | hl-section class |
|---|---|---|
| Background | accent (yellow) | default |
| Priorities | orange | `hl-section-warn` |
| Stances on issues | teal | `hl-section-info` |
| Strengths | green | `hl-section-good` |
| Criticisms | pink | `hl-section-danger` |
| History timeline | accent | default |
| Endorsements | green | — |
| "Vote for if..." | accent | default |
| Bottom line | accent | default |
| News | — | — |

### History timeline
- Ordered most-recent LEFT
- Pre-cycle events (older than newest event year − 1) render at `opacity-40`
- Date specificity: `Month Day, Year` > `Month Year` > `Year`

### Endorsements
Grouped by category in this order: Elected Officials → Unions → Advocacy & Industry → Local Leaders → Newspapers & Media.

---

## UpdateBar

**Component:** `UpdateBar.tsx`

- Subscribes to Supabase Realtime on `candidates`, `races`, `endorsements`, `polls`
- Starts disabled ("Up to date")
- When a change arrives: enables with "Update available"
- On click: calls `router.refresh()` to bust RSC cache — no LLM calls, no source scraping
- After refresh: shows "Up to date" for 5s then returns to disabled
- News updates push to the carousel directly via their own Realtime subscription — the UpdateBar is not involved

---

## Scroll anchoring
Each race section has `id="race-{id}"`. Candidate profile articles have `scroll-mt-32` so anchor jumps clear the sticky header.
