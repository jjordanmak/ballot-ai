-- 0014: articles the news collector has read for matching (2026-10-30).
--
-- When an article's headline and feed summary don't name a tracked race, the
-- collector reads the article itself once (politely) and matches on its text.
-- This table remembers which URLs it has read so none is read twice. It holds
-- only the public article URL, when it was read and how that went: never the
-- article's text, and nothing about any voter. Service role only; rows older
-- than 30 days are deleted by the daily news recheck.
--
-- Rollback: drop table public.feed_article_reads;

create table public.feed_article_reads (
  url      text primary key,
  read_at  timestamptz not null default now(),
  outcome  text not null check (outcome in ('read', 'robots', 'busy', 'blocked', 'error', 'empty')),
  matched  boolean not null default false
);
create index feed_article_reads_read_at_idx on public.feed_article_reads (read_at);

alter table public.feed_article_reads enable row level security;
