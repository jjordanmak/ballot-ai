-- 0008 — Live content feed for the address-first ballot (Nov 3, 2026+).
--
-- ADDITIVE ONLY: new tables and functions, no changes to existing rows. The
-- June primary archive keeps its own `news_items`.
--
--   feed_items            one row per collected item (news, polls; later
--                         endorsements, stances, events). Auto-published when
--                         it passes automated checks, otherwise 'held' (never
--                         shown). Tagged with the durable contests and
--                         candidates it is about.
--   feed_item_checks      retraction-check bookkeeping (service only), kept
--                         apart so checks never notify open pages.
--   feed_source_state     per-source fetch bookkeeping (ETag, failures).
--   candidate_links       X accounts found on a candidate's campaign site,
--                         each with the page it was found on.
--   candidate_link_checks when each campaign site was last checked (service only).
--   ballot_feed()         first-load read: newest N published items per contest.
--   feed_items_broadcast  pushes published / removed items to open pages via
--                         Realtime Broadcast, one topic per election and state
--                         ("feed:{election}:{ST}"), so a page only hears its
--                         own state's items.
--
-- Also adds contest_candidates.display_name (readable name used for matching).
--
-- No table stores a residential address. Rollback:
--   drop function public.ballot_feed(text, uuid[], int);
--   drop table public.candidate_link_checks, public.candidate_links, public.feed_source_state,
--              public.feed_item_checks, public.feed_items;
--   drop function public.feed_items_broadcast();
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
  updated_at     timestamptz not null default now()
);
create index feed_items_election_published_idx on public.feed_items (election_id, published_at desc)
  where status = 'published';
create index feed_items_contests_idx on public.feed_items using gin (contest_ids);
create index feed_items_candidates_idx on public.feed_items using gin (candidate_ids);

create trigger feed_items_touch before update on public.feed_items
  for each row execute function public.touch_updated_at();

create table public.feed_item_checks (
  item_id     uuid primary key references public.feed_items (id) on delete cascade,
  checked_at  timestamptz not null default now(),
  last_status int
);
create index feed_item_checks_checked_idx on public.feed_item_checks (checked_at);

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
  failures         int not null default 0,          -- consecutive failed fetches (backoff)
  items_seen       int not null default 0
);

-- ---------------------------------------------------------------------------
-- candidate_links (+ checks)
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

create table public.candidate_link_checks (
  contest_candidate_id  uuid primary key references public.contest_candidates (id) on delete cascade,
  checked_at            timestamptz not null default now(),
  found                 boolean not null default false
);

-- ---------------------------------------------------------------------------
-- RLS: the public reads published feed items and candidate links. Held
-- items, checks and source state are service-only. Writes are service-role
-- only (no write policies).
-- ---------------------------------------------------------------------------
alter table public.feed_items            enable row level security;
alter table public.feed_item_checks      enable row level security;
alter table public.feed_source_state     enable row level security;
alter table public.candidate_links       enable row level security;
alter table public.candidate_link_checks enable row level security;

create policy "public read published" on public.feed_items for select using (status = 'published');
create policy "public read"           on public.candidate_links for select using (true);
revoke all on public.feed_item_checks, public.feed_source_state, public.candidate_link_checks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- First load: newest published items per contest, so a busy statewide race
-- can't crowd local contests out. Runs as the caller (RLS applies).
-- ---------------------------------------------------------------------------
create or replace function public.ballot_feed(p_election_id text, p_contest_ids uuid[], p_per_contest int default 12)
returns table (
  id uuid, type text, publisher text, title text, excerpt text, url text,
  published_at timestamptz, ingested_at timestamptz, status text,
  contest_ids uuid[], candidate_ids uuid[], payload jsonb
)
language sql stable security invoker set search_path = public as $$
  select distinct on (f.id)
         f.id, f.type, f.publisher, f.title, f.excerpt, f.url, f.published_at, f.ingested_at, f.status,
         f.contest_ids, f.candidate_ids, f.payload
  from unnest(p_contest_ids[1:200]) as c(contest_id)
  cross join lateral (
    select fi.* from public.feed_items fi
    where fi.election_id = p_election_id and fi.status = 'published' and fi.contest_ids @> array[c.contest_id]
    order by fi.published_at desc
    limit least(greatest(p_per_contest, 1), 50)
  ) f
  order by f.id;
$$;
grant execute on function public.ballot_feed(text, uuid[], int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Broadcast: a page subscribes to "feed:{election}:{ST}" for its state. An
-- item goes to the state of every contest it is about. Only visible
-- transitions are sent: newly published, a published item's visible fields
-- changing, or a published item being removed.
-- ---------------------------------------------------------------------------
create or replace function public.feed_items_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st text;
  body jsonb;
begin
  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.status = 'published'
       and (old.title, old.excerpt, old.url, old.publisher, old.published_at, old.contest_ids, old.candidate_ids, old.payload)
           is not distinct from
           (new.title, new.excerpt, new.url, new.publisher, new.published_at, new.contest_ids, new.candidate_ids, new.payload) then
      return new;
    end if;
    body := jsonb_build_object(
      'id', new.id, 'type', new.type, 'publisher', new.publisher, 'title', new.title, 'excerpt', new.excerpt,
      'url', new.url, 'published_at', new.published_at, 'ingested_at', new.ingested_at, 'status', new.status,
      'contest_ids', new.contest_ids, 'candidate_ids', new.candidate_ids, 'payload', new.payload);
  elsif tg_op = 'UPDATE' and old.status = 'published' then
    body := jsonb_build_object('id', new.id, 'status', 'removed');
  else
    return new; -- held items are never sent
  end if;

  for st in
    select distinct d.state from public.contests c join public.divisions d on d.key = c.division_key
    where c.id = any(new.contest_ids) and d.state is not null
  loop
    perform realtime.send(body, 'feed', 'feed:' || new.election_id || ':' || st, false);
  end loop;
  return new;
end $$;

create trigger feed_items_broadcast after insert or update on public.feed_items
  for each row execute function public.feed_items_broadcast();

-- Trigger-only: not callable through the API.
revoke execute on function public.feed_items_broadcast() from public, anon, authenticated;
