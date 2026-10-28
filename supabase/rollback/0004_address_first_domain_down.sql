-- Rollback for 0004 (and 0005). Drops ONLY objects added by those migrations.
-- Legacy tables and their rows are untouched.
delete from public.elections where id = 'us-2026-11-03-general';

drop table if exists public.resolution_events;
drop table if exists public.ballot_resolutions;
drop table if exists public.manual_overrides;
drop table if exists public.provider_records;
drop table if exists public.contest_measures;
drop table if exists public.measures;
drop table if exists public.contest_candidates;
drop table if exists public.contests;
drop table if exists public.divisions;

drop index if exists public.elections_slug_key;
alter table public.elections drop constraint if exists elections_status_check;
alter table public.elections
  drop column if exists external_ids,
  drop column if exists scope_ocd_id,
  drop column if exists status,
  drop column if exists slug;
-- touch_updated_at keeps its pinned search_path (behavior-identical).
