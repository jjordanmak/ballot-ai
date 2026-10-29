-- 0011 — Ballot pages read published research with the public (anon) key,
-- like feed_items. Only current, published versions are visible; held rows
-- and older versions stay service-role only. synthesis_runs stays private.
-- Rollback: drop policy "public read published research" on public.synthesized_field_versions;

create policy "public read published research" on public.synthesized_field_versions
  for select using (is_current and status = 'published');
