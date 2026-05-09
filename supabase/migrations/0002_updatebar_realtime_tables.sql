-- Publish the content tables watched by UpdateBar.
-- The initial migration published news_items and polls, but the client also
-- listens for races, candidates, and endorsements before enabling refresh.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'races'
  ) then
    alter publication supabase_realtime add table public.races;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'candidates'
  ) then
    alter publication supabase_realtime add table public.candidates;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'endorsements'
  ) then
    alter publication supabase_realtime add table public.endorsements;
  end if;
end $$;
