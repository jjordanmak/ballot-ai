-- 0007 — Monthly usage cap for paid third-party APIs (Google Places).
--
-- One counter row per (month, metric). The server calls consume_api_quota()
-- before every Places request; it adds one and returns true only while the
-- month's count is below the limit, atomically, so concurrent serverless
-- instances can't overshoot. Limits live in env vars, not here.
--
-- Stores no addresses, no typed input, no IPs: just a month, a metric
-- name and a count. Service role only (RLS on, no policies).
-- Rollback: drop function public.consume_api_quota(text, text, integer); drop table public.api_usage;

create table public.api_usage (
  period     text        not null,  -- billing month, America/Los_Angeles, e.g. '2026-11'
  metric     text        not null,  -- e.g. 'places.autocomplete', 'places.details'
  count      integer     not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (period, metric)
);

alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;

create function public.consume_api_quota(p_period text, p_metric text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  used integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into public.api_usage as u (period, metric, count)
  values (p_period, p_metric, 1)
  on conflict (period, metric) do update
    set count = u.count + 1, updated_at = now()
    where u.count < p_limit
  returning u.count into used;
  return used is not null;
end;
$$;

revoke all on function public.consume_api_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_api_quota(text, text, integer) to service_role;
