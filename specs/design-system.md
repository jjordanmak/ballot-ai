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
| `--color-pf` / `--color-pf-soft` | Peace and Freedom |
| `--color-aip` / `--color-aip-soft` | American Independent |
| `--color-np` / `--color-np-soft` | No Party Preference |

### Supplementary tints
Used for data encoding (section pillars, news item types) — never as primary surface backgrounds.

| Token | Use |
|---|---|
| `--color-tint-orange` | Priorities pillar |
| `--color-tint-teal` | Stances pillar, news items |
| `--color-tint-green` | Strengths pillar, endorsements |
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

`font-mono-cap` is used for all three section eyebrows ("In the news" / "Side-by-side" / "Candidate profiles") — they must all share the same shape: `font-mono-cap text-[11px] text-paper + lucide icon size=12 className="text-accent" + tracking-[0.16em]`.

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

Phase 5 replaces the regex approach: the synthesis prompt wraps 2–3 load-bearing phrases per field in `<mark>` tags before storing in DB. The regex stays as fallback for non-synthesized content.

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
