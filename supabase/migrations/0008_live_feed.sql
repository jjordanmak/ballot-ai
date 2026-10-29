-- 0008 — Live content feed for the address-first ballot (Nov 3, 2026+).
--
-- ADDITIVE ONLY: three new tables, no changes to existing rows. The June
-- primary archive keeps its own `news_items`.
--
--   feed_items        one row per collected item (news today; polls,
--                     endorsements, stances, events later). Auto-published
--                     when it passes automated checks, otherwise 'held'
--                     (never shown). Tagged with the durable contests and
--                     candidates it is about.
--   feed_source_state per-source fetch bookkeeping (ETag, last fetch).
--   candidate_links   official campaign site / X account per candidate,
--                     each with the official page it was found on.
--
-- Also adds contest_candidates.display_name (readable name used for matching).
--
-- No table stores a residential address. Rollback:
--   drop table public.candidate_links, public.feed_source_state, public.feed_items;
--   alter table public.contest_candidates drop column display_name;

alter table public.contest_candidates add column if not exists display_name text;

-- ---------------------------------------------------------------------------
-- feed_items
-- ---------------------------------------------------------------------------
create table public.feed_items (
  id             uuid primary key default gen_random_uuid(),
  election_id    text not null references public.elections (id) on delete cascade,
  type           text not null check (type in ('news', 'social', 'poll', 'endorsement', 'stance', 'event')),
  source_key     text not null,                       -- entry in src/data/sources/*.json
  publisher      text not null,                       -- display name, e.g. "CalMatters"
  title          text not null,
  excerpt        text,
  url            text not null unique,                -- canonicalized
  image_url      text,
  published_at   timestamptz not null,
  ingested_at    timestamptz not null default now(),
  status         text not null default 'published' check (status in ('published', 'held', 'removed')),
  held_reason    text,
  -- Durable contests / candidates the item is about (contests.id, contest_candidates.id).
  contest_ids    uuid[] not null default '{}',
  candidate_ids  uuid[] not null default '{}',
  match          jsonb not null default '{}'::jsonb,  -- why it matched (terms), for audit
  payload        jsonb not null default '{}'::jsonb,  -- type-specific fields (poll numbers, …)
  checked_at     timestamptz,                          -- last retraction check
  updated_at     timestamptz not null default now()
);
create index feed_items_election_published_idx on public.feed_items (election_id, published_at desc)
  where status = 'published';
create index feed_items_contests_idx on public.feed_items using gin (contest_ids);
create index feed_items_candidates_idx on public.feed_items using gin (candidate_ids);

create trigger feed_items_touch before update on public.feed_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- feed_source_state (service only)
-- ---------------------------------------------------------------------------
create table public.feed_source_state (
  source_key       text primary key,
  etag             text,
  last_modified    text,
  last_fetched_at  timestamptz,
  last_status      int,
  last_error       text,
  items_seen       int not null default 0
);

-- ---------------------------------------------------------------------------
-- candidate_links
-- ---------------------------------------------------------------------------
create table public.candidate_links (
  id                    uuid primary key default gen_random_uuid(),
  contest_candidate_id  uuid not null references public.contest_candidates (id) on delete cascade,
  kind                  text not null check (kind in ('campaign', 'x')),
  url                   text not null,
  verified_from         text not null,                -- official page the link was found on
  checked_at            timestamptz not null default now(),
  unique (contest_candidate_id, kind)
);

-- ---------------------------------------------------------------------------
-- RLS: the public reads published (and removed, so open pages see the
-- retraction arrive) feed items and all candidate links. Held items and
-- source state are service-only. Writes are service-role only.
-- ---------------------------------------------------------------------------
alter table public.feed_items        enable row level security;
alter table public.feed_source_state enable row level security;
alter table public.candidate_links   enable row level security;

create policy "public read shown" on public.feed_items for select using (status in ('published', 'removed'));
create policy "public read"       on public.candidate_links for select using (true);
revoke all on public.feed_source_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: open ballot pages receive new and retracted items.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_items'
  ) then
    alter publication supabase_realtime add table public.feed_items;
  end if;
end $$;
