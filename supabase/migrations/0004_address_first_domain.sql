-- 0004 — Address-first domain model (Nov 3, 2026 refresh).
--
-- ADDITIVE ONLY. Existing tables/rows (June 2026 primary archive) are not
-- modified except: new nullable/defaulted columns on `elections`, and a
-- status backfill for the one existing election. Reversible via
-- supabase/rollback/0004_address_first_domain_down.sql.
--
-- Create-only: applies once; every object it creates is new.
--
-- See docs/architecture/DATA_MODEL.md and docs/architecture/PRIVACY.md.
-- No table in this migration stores a residential address.

-- ---------------------------------------------------------------------------
-- elections: slug, lifecycle status, scope, provider ids
-- ---------------------------------------------------------------------------
alter table public.elections
  add column if not exists slug          text,
  add column if not exists status        text not null default 'upcoming',
  add column if not exists scope_ocd_id  text,
  add column if not exists external_ids  jsonb not null default '{}'::jsonb;

alter table public.elections
  add constraint elections_status_check check (status in ('upcoming', 'active', 'archived'));

update public.elections
   set slug = '2026-06-02-ca-primary', status = 'archived',
       scope_ocd_id = 'ocd-division/country:us/state:ca'
 where id = 'ca-2026-primary' and slug is null;

create unique index if not exists elections_slug_key on public.elections (slug);

-- The Nov 3 election row is inserted by 0005, applied together with the
-- production deploy (the currently deployed landing page would otherwise
-- default to it and break the legacy ZIP flow).

-- ---------------------------------------------------------------------------
-- divisions: political geography (open-ended scope vocabulary)
-- ---------------------------------------------------------------------------
create table if not exists public.divisions (
  key         text primary key,            -- OCD id, or "{scope}:{id}:{normalized name}"
  ocd_id      text,
  name        text not null,
  scope       text,
  parent_key  text references public.divisions (key) on delete set null,
  state       text,
  county      text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists divisions_ocd_idx on public.divisions (ocd_id);

-- ---------------------------------------------------------------------------
-- contests / contest_candidates / measures: DURABLE, officially verified
-- records. (The per-request provider answer lives in ballot_resolutions.)
-- ---------------------------------------------------------------------------
create table if not exists public.contests (
  id                     uuid primary key default gen_random_uuid(),
  election_id            text not null references public.elections (id) on delete cascade,
  division_key           text not null references public.divisions (key),
  kind                   text not null check (kind in ('candidate', 'measure')),
  contest_type           text not null default 'other',
  title                  text not null,
  normalized_title       text not null,
  ballot_title           text,
  number_elected         int check (number_elected > 0),
  vote_for               int check (vote_for > 0),
  partisan               boolean,
  special                boolean not null default false,
  ballot_order           int,
  provider_ids           jsonb not null default '{}'::jsonb,
  verified_at            timestamptz,
  verification_source_id uuid references public.sources (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (election_id, division_key, normalized_title)
);
create index if not exists contests_election_idx on public.contests (election_id);

create table if not exists public.contest_candidates (
  id                  uuid primary key default gen_random_uuid(),
  contest_id          uuid not null references public.contests (id) on delete cascade,
  ballot_name         text not null,       -- verbatim official name
  normalized_name     text not null,
  party               text,
  designation         text,
  incumbent           boolean,
  order_on_ballot     int,
  campaign_url        text,
  provider_ids        jsonb not null default '{}'::jsonb,
  legacy_candidate_id text references public.candidates (id) on delete set null,
  source_id           uuid references public.sources (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (contest_id, normalized_name)
);

create table if not exists public.measures (
  id                 uuid primary key default gen_random_uuid(),
  election_id        text not null references public.elections (id) on delete cascade,
  division_key       text not null references public.divisions (key),
  identifier         text,                 -- "Proposition 50", "Measure A"
  normalized_ident   text not null,        -- identifier, or title when no identifier
  title              text not null,
  summary            text,
  passage_threshold  text,
  official_url       text,
  full_text_url      text,
  analysis_url       text,
  source_id          uuid references public.sources (id) on delete set null,
  verified_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (election_id, division_key, normalized_ident)
);

create table if not exists public.contest_measures (
  contest_id uuid not null references public.contests (id) on delete cascade,
  measure_id uuid not null references public.measures (id) on delete cascade,
  primary key (contest_id, measure_id)
);

-- ---------------------------------------------------------------------------
-- provider_records: normalization debugging / reconciliation (no payloads,
-- which may echo the address — hashes and ids only)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_records (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  entity_type        text not null check (entity_type in ('contest', 'candidate', 'measure', 'election')),
  entity_id          text not null,
  external_id        text,
  payload_hash       text,
  normalizer_version text,
  fetched_at         timestamptz not null default now()
);
create index if not exists provider_records_entity_idx on public.provider_records (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- manual_overrides: audited corrections; imported data is never mutated
-- ---------------------------------------------------------------------------
create table if not exists public.manual_overrides (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null check (entity_type in ('contest', 'candidate', 'measure', 'election')),
  entity_id       text not null,
  field           text not null,
  original_value  jsonb,
  corrected_value jsonb not null,
  reason          text not null,
  source_id       uuid references public.sources (id) on delete set null,
  created_by      text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists manual_overrides_entity_idx on public.manual_overrides (entity_type, entity_id) where active;

-- ---------------------------------------------------------------------------
-- ballot_resolutions: PROVIDER CACHE keyed by address-free geography key.
-- TTL honors provider Cache-Control (capped at 24h). Service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.ballot_resolutions (
  ballot_key   text primary key,
  election_id  text not null references public.elections (id) on delete cascade,
  provider     text not null,
  status       text not null check (status in ('SUCCESS', 'PARTIAL')),
  ballot       jsonb not null,             -- normalized ResolvedBallot, address-free
  location     jsonb not null default '{}'::jsonb,  -- {city, county, state} only
  retrieved_at timestamptz not null,
  expires_at   timestamptz not null
);
create index if not exists ballot_resolutions_expires_idx on public.ballot_resolutions (expires_at);

-- ---------------------------------------------------------------------------
-- resolution_events: privacy-safe metrics (no address, IP, UA, or key)
-- ---------------------------------------------------------------------------
create table if not exists public.resolution_events (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  election_id   text,
  provider      text not null,
  status        text not null,
  latency_ms    int,
  contest_count int,
  state         text,
  warning_codes text[] not null default '{}',
  cache_hit     boolean not null default false
);
create index if not exists resolution_events_time_idx on public.resolution_events (occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.divisions          enable row level security;
alter table public.contests           enable row level security;
alter table public.contest_candidates enable row level security;
alter table public.measures           enable row level security;
alter table public.contest_measures   enable row level security;
alter table public.provider_records   enable row level security;
alter table public.manual_overrides   enable row level security;
alter table public.ballot_resolutions enable row level security;
alter table public.resolution_events  enable row level security;

create policy "public read" on public.divisions          for select using (true);
create policy "public read" on public.contests           for select using (true);
create policy "public read" on public.contest_candidates for select using (true);
create policy "public read" on public.measures           for select using (true);
create policy "public read" on public.contest_measures   for select using (true);
-- Corrections are public for transparency; only active ones.
create policy "public read active" on public.manual_overrides for select using (active);
-- provider_records, ballot_resolutions, resolution_events: no policies → service role only.

-- ---------------------------------------------------------------------------
-- Triggers + advisor fix (function_search_path_mutable)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contests_touch before update on public.contests
  for each row execute function public.touch_updated_at();
