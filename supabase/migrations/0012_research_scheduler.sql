-- 0012 — News feed discovery, the research scheduler, polite fetching, and
-- live refresh when research is published.
--
-- * feed_source_state.resolved_url: an outlet's moved feed, found on its own
--   site (src/lib/feeds/discover.ts); retry_at: the publisher's Retry-After.
-- * research_state: one row per research job (target × model setting). The
--   every-minute dispatcher reads only rows that are due; claim_research_jobs
--   locks them atomically so overlapping runs never do the same job twice.
-- * fetch_hosts: per-site politeness shared by parallel workers: robots.txt,
--   the next free request slot (one request per site every few seconds),
--   and a slow-down factor after a 403/429.
-- * research_broadcast: a published research version tells open ballot pages
--   in that state to refresh (same Broadcast channel as the live feed).
--
-- No addresses anywhere: targets are contest/candidate ids and office keys.
-- Rollback:
--   drop trigger research_broadcast on public.synthesized_field_versions; drop function public.research_broadcast();
--   drop function public.claim_research_jobs(text[], integer, integer); drop function public.reserve_host_slot(text, integer);
--   drop table public.research_state; drop table public.fetch_hosts;
--   alter table public.feed_source_state drop column resolved_url, drop column retry_at;

alter table public.feed_source_state
  add column resolved_url text,
  add column retry_at timestamptz;

create table public.research_state (
  key           text primary key,          -- target key, plus "@model:effort" in compare mode
  target        jsonb not null,            -- what the worker needs: kind, ids, label, pages, search
  next_check_at timestamptz not null default now(),
  locked_until  timestamptz,
  input_hash    text,
  last_outcome  text,                      -- published | held | failed | no documents | unchanged | rate limited
  failures      integer not null default 0,
  discovered    jsonb,                     -- cached search results: { urls: [...], at }
  updated_at    timestamptz not null default now()
);
create index research_state_due_idx on public.research_state(next_check_at);

create table public.fetch_hosts (
  host              text primary key,
  next_free_at      timestamptz not null default now(),
  slow_factor       integer not null default 1 check (slow_factor between 1 and 16),
  robots_txt        text,
  robots_fetched_at timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.research_state enable row level security;
alter table public.fetch_hosts enable row level security;
revoke all on public.research_state, public.fetch_hosts from anon, authenticated;

-- Claim up to p_limit of the given jobs that are due and unlocked; returns the claimed keys.
create function public.claim_research_jobs(p_keys text[], p_limit integer, p_lock_seconds integer)
returns setof text
language sql
set search_path = ''
as $$
  update public.research_state s
     set locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
   where s.key in (
     select r.key from public.research_state r
      where r.key = any(p_keys)
        and r.next_check_at <= now()
        and (r.locked_until is null or r.locked_until < now())
      order by r.next_check_at
      limit greatest(p_limit, 0)
      for update skip locked)
  returning s.key;
$$;

-- Reserve the next request slot for a site; returns how many ms to wait (0 = go now).
create function public.reserve_host_slot(p_host text, p_spacing_ms integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  slot timestamptz;
  factor integer;
begin
  insert into public.fetch_hosts as h (host) values (p_host) on conflict (host) do nothing;
  select greatest(h.next_free_at, now()), h.slow_factor into slot, factor
    from public.fetch_hosts h where h.host = p_host for update;
  update public.fetch_hosts
     set next_free_at = slot + make_interval(secs => (p_spacing_ms * factor) / 1000.0), updated_at = now()
   where host = p_host;
  return greatest(0, ceil(extract(epoch from (slot - now())) * 1000))::integer;
end;
$$;

revoke all on function public.claim_research_jobs(text[], integer, integer) from public, anon, authenticated;
revoke all on function public.reserve_host_slot(text, integer) from public, anon, authenticated;
grant execute on function public.claim_research_jobs(text[], integer, integer) to service_role;
grant execute on function public.reserve_host_slot(text, integer) to service_role;

-- Open ballot pages refresh when research for their state is published.
-- The research job puts { election, state } in payload.scope.
create function public.research_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  el text := new.payload -> 'scope' ->> 'election';
  st text := new.payload -> 'scope' ->> 'state';
begin
  if new.status = 'published' and new.is_current and el is not null and st is not null then
    perform realtime.send(jsonb_build_object('target', new.target_id), 'research', 'feed:' || el || ':' || upper(st), false);
  end if;
  return new;
end $$;

create trigger research_broadcast after insert on public.synthesized_field_versions
  for each row execute function public.research_broadcast();

revoke execute on function public.research_broadcast() from public, anon, authenticated;
