# Phase 3 — Mobile responsive spec

## Goal
Make the app shareable and usable on phones before building the data pipeline. A voter should be able to look up their ballot on their phone the night before an election.

## Breakpoints
- `< lg` (< 1024px): mobile/tablet layout — sidebar hidden, top nav shown
- `>= lg`: current desktop layout unchanged

---

## Component changes

### Sidebar → Top nav + hamburger drawer

**Desktop (>= lg):** unchanged — `sticky top-0 left-0 h-screen` left rail.

**Mobile (< lg):**
- Sidebar hidden (`hidden lg:block`)
- Top nav bar added: `sticky top-0 z-50` with:
  - Left: `ballot.ai` brand (same rendering as sidebar brand)
  - Center or right: election name / location (abbreviated)
  - Right: hamburger icon button
- Hamburger opens a full-height drawer (slide in from left or full-screen overlay):
  - Same race nav content as the desktop sidebar
  - Scroll-spy still drives active highlight
  - Tap a race → closes drawer, scrolls to race section
  - "Change" and "Top" buttons at the bottom of the drawer

### Cover
- Full-width on mobile
- Location text wraps naturally
- Stats reduce or stack vertically if needed

### Landing page
- Full-width ZIP input (no side panel at any breakpoint — landing is already centered-column)
- Election dropdown full-width
- CTA button full-width on mobile

### Comparison table
- Horizontal scroll on mobile (already partially implemented via `bodyRef` scroll sync)
- Sticky first column (frozen label) must work correctly on mobile
- Chip toolbar: chips wrap to two rows if needed, or become a horizontal scroll strip
- Consider: on very small screens (< sm), show a simplified stacked view instead of the table — one candidate at a time with swipe navigation (nice-to-have, not required for Phase 3)

### Candidate profiles
- Cards already stack vertically — should work naturally
- Sticky eyebrow group: on mobile, top offset must account for the top nav height (top nav is ~56px — use `top-[56px]` or CSS var)
- Section pillars already stack — no changes needed

### News feed carousel
- Single-column on mobile: remove the bento paired-column layout, render cards in a single scrollable row
- Card min-width should be 85vw on mobile so one card is fully visible + the next peeks

### Race header
- Meta strip: wrap to two columns (2×2 or 2×3 grid) on mobile instead of a single row
- Polling card: full-width bar chart, no side-by-side

---

## Sticky offset adjustment
The desktop layout uses `sticky top-0` with `pt-8` padding. On mobile, the top nav adds ~56px. The comparison sticky group and candidate profiles sticky group need to account for this:

Option A: CSS variable `--sticky-top` set to `0px` on desktop and `56px` on mobile, used in the sticky `top` value.

Option B: Tailwind responsive variant — `top-0 lg:top-0` on desktop, `top-14` (56px) on mobile.

---

## Definition of done
- [ ] All races visible and readable on iPhone 14 Pro (390px wide)
- [ ] Sidebar accessible via hamburger on mobile
- [ ] Comparison table horizontally scrollable on mobile
- [ ] No horizontal overflow on the page itself (no body scroll)
- [ ] News carousel single-column on mobile
- [ ] Sticky elements don't overlap the top nav
- [ ] Desktop layout unchanged
