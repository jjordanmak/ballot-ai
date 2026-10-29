-- 0005 — Register the November 3, 2026 General Election.
--
-- Apply at the same time as the address-first production deploy: the legacy
-- landing page defaults to the first upcoming election and would pick this
-- row up. The Google Civic election id is discovered at runtime via
-- /elections and is intentionally NOT stored here.
insert into public.elections (id, state, date, name, type, slug, status, scope_ocd_id)
values ('us-2026-11-03-general', 'US', '2026-11-03', 'November 3, 2026 General Election',
        'general', '2026-11-03', 'active', 'ocd-division/country:us')
on conflict (id) do nothing;
