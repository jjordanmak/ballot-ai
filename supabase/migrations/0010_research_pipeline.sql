-- 0010 — In-app research pipeline (docs/architecture/AI_ARCHITECTURE.md).
--
-- Fetched source text lives on `sources` (content_text + raw_hash of that
-- text), so a re-run only happens when a cited document actually changes.
-- AI output is written only to synthesized_field_versions, as structured
-- JSON with the exact quote behind each answer; rows that fail an automated
-- check are kept as 'held' with the reason and never served.
--
-- Measures and contests become synthesis targets. The AI pipeline still has
-- no write path to contests, contest_candidates or elections.
--
-- No addresses: targets are durable contest/candidate ids and public URLs.
-- Rollback:
--   alter table public.sources drop column content_text;
--   alter table public.synthesized_field_versions drop column payload, drop column status, drop column held_reason;
--   restore the two target_type checks to ('race','candidate','issue','about');
--   drop function public.add_api_spend(text, text, integer);

alter table public.sources add column content_text text;

alter table public.synthesis_runs drop constraint synthesis_runs_target_type_check;
alter table public.synthesis_runs add constraint synthesis_runs_target_type_check
  check (target_type in ('race', 'candidate', 'issue', 'about', 'measure', 'contest'));

alter table public.synthesized_field_versions drop constraint synthesized_field_versions_target_type_check;
alter table public.synthesized_field_versions add constraint synthesized_field_versions_target_type_check
  check (target_type in ('race', 'candidate', 'issue', 'about', 'measure', 'contest'));

alter table public.synthesized_field_versions
  add column payload jsonb,
  add column status text not null default 'published' check (status in ('published', 'held')),
  add column held_reason text;

-- A published answer always cites at least one fetched source.
alter table public.synthesized_field_versions
  add constraint synthesized_published_cites check (status <> 'published' or cardinality(source_ids) > 0);

create index synthesis_runs_input_idx on public.synthesis_runs(target_type, target_id, field_name, input_hash);

-- synthesized_field_versions keeps RLS on with no policies: the server reads
-- it with the service role and serves only published, current rows.

-- Monthly AI spend in micro-dollars, added after each call. Same table as
-- the Places cap; one row per (month, metric). Returns the new total.
create function public.add_api_spend(p_period text, p_metric text, p_amount integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  total integer;
begin
  insert into public.api_usage as u (period, metric, count)
  values (p_period, p_metric, greatest(p_amount, 0))
  on conflict (period, metric) do update
    set count = u.count + greatest(p_amount, 0), updated_at = now()
  returning u.count into total;
  return total;
end;
$$;

revoke all on function public.add_api_spend(text, text, integer) from public, anon, authenticated;
grant execute on function public.add_api_spend(text, text, integer) to service_role;
