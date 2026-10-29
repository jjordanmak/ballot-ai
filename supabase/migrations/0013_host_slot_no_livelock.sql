-- 0013: a caller that won't wait doesn't take a slot (2026-10-29).
--
-- reserve_host_slot(host, spacing) always moved a site's next free slot
-- forward, even when the caller then gave up because the wait was too long.
-- With several research jobs retrying a busy site every minute, each failed
-- attempt pushed the queue further out and it never drained (smcacre.gov
-- reached 18 minutes). This version takes the longest wait the caller will
-- accept: past it, it returns the wait and reserves nothing.
--
-- The two-argument function stays for already-deployed code.
-- Rollback: drop function public.reserve_host_slot(text, integer, integer);

create function public.reserve_host_slot(p_host text, p_spacing_ms integer, p_max_wait_ms integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  slot timestamptz;
  factor integer;
  wait_ms integer;
begin
  insert into public.fetch_hosts as h (host) values (p_host) on conflict (host) do nothing;
  select greatest(h.next_free_at, now()), h.slow_factor into slot, factor
    from public.fetch_hosts h where h.host = p_host for update;
  wait_ms := greatest(0, ceil(extract(epoch from (slot - now())) * 1000))::integer;
  if wait_ms > p_max_wait_ms then
    return wait_ms;
  end if;
  update public.fetch_hosts
     set next_free_at = slot + make_interval(secs => (p_spacing_ms * factor) / 1000.0), updated_at = now()
   where host = p_host;
  return wait_ms;
end;
$$;

revoke all on function public.reserve_host_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_host_slot(text, integer, integer) to service_role;
