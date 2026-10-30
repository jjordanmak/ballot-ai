-- 0015: national test list results (owner, 2026-10-30).
--
-- A nightly job looks up a fixed list of public civic buildings (city halls,
-- one or more per state; the list lives in a private env var, never here) and
-- stores what came back so ballot data can be checked for consistency across
-- the country. Address-free: each row has only the location's label, its state,
-- the lookup status, contest counts, warnings, and the race titles, district
-- names, candidate names and party labels exactly as the provider sent them.
-- Service role only.
--
-- Rollback: drop table public.qa_runs;

create table public.qa_runs (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null,
  run_at         timestamptz not null default now(),
  label          text not null,
  state          text,
  status         text not null,
  contest_count  int not null default 0,
  categories     jsonb not null default '{}'::jsonb,
  warnings       jsonb not null default '[]'::jsonb,
  inventory      jsonb not null default '{}'::jsonb,
  error          text
);
create index qa_runs_run_at_idx on public.qa_runs (run_at desc);

alter table public.qa_runs enable row level security;
