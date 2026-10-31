-- 0020: three independent matching checks per news story (owner, 2026-10-30).
--
--   feed_items.race_ids   the races and measures whose own feed shows the item:
--                         the race (or measure) itself is the subject. A story
--                         about one candidate keeps that candidate's race in
--                         contest_ids (so the page loads, pages and broadcasts it
--                         with the race) but not in race_ids, so it shows on the
--                         candidate's feed only. Existing rows start equal to
--                         contest_ids; a writer that doesn't set it (polls, older
--                         code) gets contest_ids.
--   ballot_feed()         also returns race_ids (still selects by contest_ids).
--   feed_page()           a race's older stories come by race_ids.
--   feed_items_broadcast  also sends race_ids.
--
-- Rollback:
--   drop trigger feed_items_race_default on public.feed_items; drop function public.feed_items_race_default();
--   (re-create ballot_feed and feed_page from 0016, the broadcast function from 0008)
--   alter table public.feed_items drop column race_ids;

alter table public.feed_items add column if not exists race_ids uuid[];
update public.feed_items set race_ids = contest_ids where race_ids is null;
create index if not exists feed_items_race_ids_idx on public.feed_items using gin (race_ids);

create or replace function public.feed_items_race_default() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.race_ids is null then new.race_ids := new.contest_ids; end if;
  return new;
end $$;
drop trigger if exists feed_items_race_default on public.feed_items;
create trigger feed_items_race_default before insert or update on public.feed_items
  for each row execute function public.feed_items_race_default();
revoke execute on function public.feed_items_race_default() from public, anon, authenticated;

drop function if exists public.ballot_feed(text, uuid[], int);
create function public.ballot_feed(p_election_id text, p_contest_ids uuid[], p_per_contest int default 25)
returns table (
  id uuid, type text, publisher text, title text, excerpt text, url text,
  published_at timestamptz, ingested_at timestamptz, status text,
  contest_ids uuid[], race_ids uuid[], candidate_ids uuid[], payload jsonb
)
language sql stable security invoker set search_path = public as $$
  select distinct on (f.id)
         f.id, f.type, f.publisher, f.title, f.excerpt, f.url, f.published_at, f.ingested_at, f.status,
         f.contest_ids, f.race_ids, f.candidate_ids, f.payload
  from unnest(p_contest_ids[1:200]) as c(contest_id)
  cross join (values ('news'), ('poll'), ('social')) as t(kind)
  cross join lateral (
    select fi.* from public.feed_items fi
    where fi.election_id = p_election_id and fi.status = 'published' and fi.type = t.kind
      and fi.contest_ids @> array[c.contest_id]
    order by fi.published_at desc, fi.id desc
    limit least(greatest(p_per_contest, 1), 50)
  ) f
  order by f.id;
$$;
grant execute on function public.ballot_feed(text, uuid[], int) to anon, authenticated;

drop function if exists public.feed_page(text, uuid, uuid, timestamptz, uuid, int);
create function public.feed_page(
  p_election_id text,
  p_contest_id uuid,
  p_candidate_id uuid,
  p_before_at timestamptz,
  p_before_id uuid,
  p_limit int default 25
)
returns table (
  id uuid, type text, publisher text, title text, excerpt text, url text,
  published_at timestamptz, ingested_at timestamptz, status text,
  contest_ids uuid[], race_ids uuid[], candidate_ids uuid[], payload jsonb
)
language sql stable security invoker set search_path = public as $$
  select fi.id, fi.type, fi.publisher, fi.title, fi.excerpt, fi.url, fi.published_at, fi.ingested_at, fi.status,
         fi.contest_ids, fi.race_ids, fi.candidate_ids, fi.payload
  from public.feed_items fi
  where fi.election_id = p_election_id
    and fi.status = 'published'
    and fi.type = 'news'
    and (p_contest_id is not null or p_candidate_id is not null)
    and (p_contest_id is null or fi.race_ids @> array[p_contest_id])
    and (p_candidate_id is null or fi.candidate_ids @> array[p_candidate_id])
    and (p_before_at is null or (fi.published_at, fi.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by fi.published_at desc, fi.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.feed_page(text, uuid, uuid, timestamptz, uuid, int) to anon, authenticated;

create or replace function public.feed_items_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st text;
  body jsonb;
begin
  if new.status = 'published' then
    if tg_op = 'UPDATE' and old.status = 'published'
       and (old.title, old.excerpt, old.url, old.publisher, old.published_at, old.contest_ids, old.race_ids, old.candidate_ids, old.payload)
           is not distinct from
           (new.title, new.excerpt, new.url, new.publisher, new.published_at, new.contest_ids, new.race_ids, new.candidate_ids, new.payload) then
      return new;
    end if;
    body := jsonb_build_object(
      'id', new.id, 'type', new.type, 'publisher', new.publisher, 'title', new.title, 'excerpt', new.excerpt,
      'url', new.url, 'published_at', new.published_at, 'ingested_at', new.ingested_at, 'status', new.status,
      'contest_ids', new.contest_ids, 'race_ids', new.race_ids, 'candidate_ids', new.candidate_ids, 'payload', new.payload);
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
