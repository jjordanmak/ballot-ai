# Phase 4 — Data ingestion spec

## Goal
Populate the DB with live, continuously updated data: news, candidate photos, and source material. This makes the ballot page a live product rather than a seeded demo.

## Sub-phases

---

## 4a — News ingestion

### Sources
| Source | Cadence | Notes |
|---|---|---|
| RSS feeds | Every 60s | Unlimited on free tier; high-frequency polling is fine |
| GNews API | Every 5 min | Free tier quota constraint |
| NewsData.io API | Every 5 min | Free tier quota constraint |

### Implementation
- Vercel Cron job at `/api/cron/news` — two schedules: `* * * * *` (60s) for RSS, `*/5 * * * *` for APIs
- Per candidate and per race: fetch recent items, deduplicate by URL hash, upsert into `news_items`
- Set `ingested_at` on insert; `published_at` from the feed
- Supabase Realtime broadcasts inserts on `news_items` — the `NewsFeed` component receives them and appends to the carousel without a page reload

### Candidate coverage rules (confirmed)
Apply to all data ingestion — only ingest news for candidates who meet coverage criteria:
- Qualified for any official debate, OR
- Polled ≥ 3% in any verified poll, OR
- Raised ≥ $50K, OR
- Is a major-party nominee

### ISR
Apply `export const revalidate = 300` to the ballot page once this lands so the initial HTML cache refreshes every 5 minutes.

---

## 4b — Photo resolver

### Priority chain (per candidate)
1. Wikimedia `Special:FilePath/{CandidateName}` — free, comprehensive
2. Ballotpedia OG image tag (`og:image` from the candidate's Ballotpedia page)
3. Campaign site OG image tag
4. Initials fallback (rendered in UI — no image needed)

### Implementation
- Run once per candidate on first seed; store resolved URL in `candidates.headshot_url`
- Re-run only on 404 (URL no longer valid) — checked on page render, triggered async
- No scheduled cron for photos — they don't change frequently

---

## 4c — Source ingestion

Source ingestion is deferred to Phase 5 and handled by Perplexity Sonar rather than per-site scrapers. Perplexity returns citations that map directly to `sources` and `source_evidence_links` rows.

See `phase-5-synthesis.md` for the full source ingestion flow.

---

## Environment variables needed
```
GNEWS_API_KEY=
NEWSDATA_API_KEY=
```
Add to `.env.local` and Vercel dashboard.

---

## Definition of done
- [ ] News items ingesting for Governor race candidates (at minimum)
- [ ] Realtime carousel update visible in browser without page reload
- [ ] Deduplication working (same article not inserted twice)
- [ ] `revalidate: 300` applied to ballot page
- [ ] Cron jobs visible in Vercel dashboard
