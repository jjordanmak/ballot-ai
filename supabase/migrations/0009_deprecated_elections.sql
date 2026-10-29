-- 0009 — Internal-only ("deprecated") elections.
--
-- 'deprecated': kept for internal reference only (e.g. the June 2026 CA
-- primary prototype). Never offered on the address form and never resolved
-- against; its pages render from a frozen snapshot on preview deployments.
-- 'archived' stays reserved for the future user-facing archive.
--
-- Rollback:
--   update public.elections set status = 'archived' where status = 'deprecated';
--   alter table public.elections drop constraint elections_status_check;
--   alter table public.elections add constraint elections_status_check check (status in ('upcoming', 'active', 'archived'));

alter table public.elections drop constraint if exists elections_status_check;
alter table public.elections
  add constraint elections_status_check check (status in ('upcoming', 'active', 'archived', 'deprecated'));

update public.elections set status = 'deprecated' where id = 'ca-2026-primary';
