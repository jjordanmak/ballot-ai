-- 0006 — Display name for the Nov 3, 2026 election. The UI already shows
-- the date next to the name, so the name itself omits it.
update public.elections set name = 'General Election' where id = 'us-2026-11-03-general';
