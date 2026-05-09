# Product spec

## What it is
A voter guide that shows every race and candidate on a specific voter's ballot — profiled in depth, compared side-by-side, with live news feeds. Content is source-grounded and continuously updated; no hand-authored copy in the final product.

## How it works
1. Voter enters ZIP + selects an election on the landing page
2. App resolves ZIP → jurisdiction → district codes via US Census geocoder
3. Every race on that voter's specific ballot is shown: statewide races + their congressional, state legislative, county, and local districts
4. Each race has a format/context header, side-by-side comparison table, and full candidate profiles
5. News feeds update in real time via Supabase Realtime — no page reload needed

## Target user
A California voter (June 2026 primary, expanding to other states/elections) preparing for an election. Not deeply partisan — wants facts, context, and a fair picture of every candidate. Willing to spend 20–30 minutes on this; currently spends that time across many disconnected sources.

## Mission
Replace the experience of frantically Googling candidates the night before an election with a single, trustworthy, comprehensive guide.

## Brand
- Name: **ballot.ai** (always lowercase b)
- Slogan: **"a guide to your ballot"**
- Tab titles: `ballot.ai • your voting guide` (landing) / `ballot.ai • your voting guide for [ZIP]` (ballot page)
- Voice: civic, factual, not partisan. No spin, no clickbait, no "hot takes."

## Non-goals
- Not a voter registration tool
- Not a partisan guide or endorsement engine
- Not a news publication (we aggregate and synthesize, we don't report)
- Not social / community / comment-driven
- Not a real-time election results tracker

## Scope (current)
- California, June 2, 2026 primary
- Statewide + federal + state legislative + select county races
- Architecture is jurisdiction-driven from day one — adding states/elections is additive, not a rewrite

## Success criteria (MVP)
- Loads in < 2s for a known ZIP (Vercel ISR + Supabase)
- Covers all races on a CA June 2026 ballot for a given ZIP
- Every major candidate has a complete profile (background, priorities, stances, strengths, criticisms, bottom line)
- News feed is live and updates without a page reload
- Works well on desktop; readable on mobile (Phase 3)
