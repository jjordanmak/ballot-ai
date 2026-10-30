-- 0016: more news per race, paging, and the election-cycle window (owner, 2026-10-30).
--
--   elections.cycle_start  first day a story can belong to this election
--                          (Nov 3, 2026: the day after the Nov 5, 2024 general).
--                          Null = the day after the same date 2 years earlier
--                          (src/lib/feeds/checks.ts).
--   ballot_feed()          the per-contest limit now applies per type, so polls
--                          never take the news slots (page load asks for 25).
--   feed_page()            older published items for one race or one candidate,
--                          newest first, before a (published_at, id) cursor: the
--                          "load more as you scroll" read. Runs as the caller, so
--                          RLS still hides held items.
--
-- Rollback:
--   drop function public.feed_page(text, uuid, uuid, timestamptz, uuid, int);
--   (re-create ballot_feed from 0008)
--   alter table public.elections drop column cycle_start;

alter table public.elections add column if not exists cycle_start date;
update public.elections set cycle_start = '2024-11-06' where id = 'us-2026-11-03-general' and cycle_start is null;

create or replace function public.ballot_feed(p_election_id text, p_contest_ids uuid[], p_per_contest int default 25)
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

create or replace function public.feed_page(
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
  contest_ids uuid[], candidate_ids uuid[], payload jsonb
)
language sql stable security invoker set search_path = public as $$
  select fi.id, fi.type, fi.publisher, fi.title, fi.excerpt, fi.url, fi.published_at, fi.ingested_at, fi.status,
         fi.contest_ids, fi.candidate_ids, fi.payload
  from public.feed_items fi
  where fi.election_id = p_election_id
    and fi.status = 'published'
    and fi.type = 'news'
    and (p_contest_id is not null or p_candidate_id is not null)
    and (p_contest_id is null or fi.contest_ids @> array[p_contest_id])
    and (p_candidate_id is null or fi.candidate_ids @> array[p_candidate_id])
    and (p_before_at is null or (fi.published_at, fi.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by fi.published_at desc, fi.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.feed_page(text, uuid, uuid, timestamptz, uuid, int) to anon, authenticated;
