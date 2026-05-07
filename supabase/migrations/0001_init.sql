-- ─── Ballot.ai: initial schema ──────────────────────────────────────
-- Tables roughly mirror src/data/types.ts. JSONB is used for fields that
-- are arrays of structured objects (intro, history, voteForIf, etc.) —
-- they're write-once, read-many, and don't need their own join tables.
--
-- Naming: snake_case in DB (Postgres convention), camelCase in TS (JS
-- convention). The data fetchers in src/lib/db/ do the conversion.
-- ────────────────────────────────────────────────────────────────────

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Elections                                                        │
-- ╰──────────────────────────────────────────────────────────────────╯
create table public.elections (
  id            text primary key,                  -- e.g. 'ca-2026-primary'
  state         text not null,                     -- 'CA'
  date          date not null,                     -- 2026-06-02
  name          text not null,                     -- 'Statewide Direct Primary Election'
  type          text not null default 'primary',   -- 'primary' | 'general' | 'special'
  created_at    timestamptz not null default now()
);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Jurisdictions  (ZIP → districts)                                │
-- ╰──────────────────────────────────────────────────────────────────╯
-- One row per ZIP. `districts` is a JSON object like:
--   { "state": "CA", "county": "San Mateo", "us_house": 15,
--     "state_assembly": 19, "state_senate": 13, "boe": 2,
--     "supervisor": 5, "city": "Daly City" }
-- The app uses these to filter races for a voter's ballot.
create table public.jurisdictions (
  zip           text primary key,
  districts     jsonb not null,
  city          text,
  county        text,
  state         text not null,
  updated_at    timestamptz not null default now()
);

create index jurisdictions_state_idx on public.jurisdictions(state);
create index jurisdictions_county_idx on public.jurisdictions(county);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Races                                                            │
-- ╰──────────────────────────────────────────────────────────────────╯
-- A race is on a voter's ballot when its (election_id, scope_*) match.
--   scope_type: 'statewide' | 'district' | 'county'
--   scope_value: ignored when statewide, else the district code
--                (e.g. 'CA-15', 'AD-19', 'BOE-2', 'SMC-county')
create table public.races (
  id                  text primary key,            -- 'governor'
  election_id         text not null references public.elections(id) on delete cascade,
  office              text not null,
  jurisdiction_label  text not null,               -- 'California Statewide'
  format              text not null,
  format_explainer    text not null,
  scope_type          text not null check (scope_type in ('statewide','district','county')),
  scope_value         text,                        -- null when statewide
  unopposed           boolean not null default false,
  meta                jsonb not null default '[]'::jsonb,
  intro               jsonb not null,
  issues              jsonb not null default '[]'::jsonb,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index races_election_idx on public.races(election_id);
create index races_scope_idx on public.races(scope_type, scope_value);
create index races_sort_idx on public.races(sort_order);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Candidates                                                       │
-- ╰──────────────────────────────────────────────────────────────────╯
create table public.candidates (
  id                  text primary key,            -- 'becerra'
  race_id             text not null references public.races(id) on delete cascade,
  name                text not null,
  party               text not null,
  headshot_url        text,
  major               boolean not null default true,
  polling_status      text not null default '',
  polling_pct         numeric(5,2),
  trend               text check (trend in ('up','down','flat')),
  campaign_suspended  jsonb,                       -- { date, note } or null
  withdrawn           boolean not null default false,
  current_position    text not null default '',  -- `current_role` is reserved in Postgres
  past_roles          jsonb not null default '[]'::jsonb,
  background          text not null default '',
  priorities          jsonb not null default '[]'::jsonb,
  stances             jsonb not null default '[]'::jsonb,
  strengths           jsonb not null default '[]'::jsonb,
  criticisms          jsonb not null default '[]'::jsonb,
  history             jsonb not null default '[]'::jsonb,
  vote_for_if         jsonb not null default '[]'::jsonb,
  bottom_line         text not null default '',
  issues              jsonb not null default '{}'::jsonb,
  sort_order          integer not null default 0,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index candidates_race_idx on public.candidates(race_id);
create index candidates_sort_idx on public.candidates(sort_order);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Endorsements                                                     │
-- ╰──────────────────────────────────────────────────────────────────╯
create table public.endorsements (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  text not null references public.candidates(id) on delete cascade,
  category      text not null check (category in (
                  'Elected Officials', 'Unions', 'Advocacy & Industry',
                  'Local Leaders', 'Newspapers & Media'
                )),
  name          text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index endorsements_candidate_idx on public.endorsements(candidate_id);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  News items                                                       │
-- ╰──────────────────────────────────────────────────────────────────╯
-- Either race-level (race_id set, candidate_id null) or candidate-level.
-- `social` is a structured JSON for social posts; null for news/poll/endorsement.
create table public.news_items (
  id              text primary key,                -- stable id from ingestion
  race_id         text references public.races(id) on delete cascade,
  candidate_id    text references public.candidates(id) on delete cascade,
  type            text not null check (type in ('news','social','poll','endorsement')),
  source          text not null,
  title           text not null,
  excerpt         text,
  url             text,
  published_at    timestamptz not null,
  social          jsonb,                           -- { platform, handle, avatar?, media?, poll?, likes?, ... }
  ingested_at     timestamptz not null default now()
);

create index news_race_idx on public.news_items(race_id, published_at desc);
create index news_candidate_idx on public.news_items(candidate_id, published_at desc);
create index news_published_idx on public.news_items(published_at desc);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Polls                                                            │
-- ╰──────────────────────────────────────────────────────────────────╯
create table public.polls (
  id              uuid primary key default gen_random_uuid(),
  race_id         text not null references public.races(id) on delete cascade,
  source          text not null,
  conducted_at    date not null,
  sample_size     integer,
  results         jsonb not null,                  -- [{ candidate_id, pct }, ...]
  url             text,
  created_at      timestamptz not null default now()
);

create index polls_race_idx on public.polls(race_id, conducted_at desc);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Realtime publications                                            │
-- ╰──────────────────────────────────────────────────────────────────╯
-- Subscribers (the news-feed carousel) get pushes when these tables change.
alter publication supabase_realtime add table public.news_items;
alter publication supabase_realtime add table public.polls;

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Row-Level Security                                              │
-- ╰──────────────────────────────────────────────────────────────────╯
-- Public reads on everything; writes restricted to service role (bypasses RLS).
alter table public.elections enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.races enable row level security;
alter table public.candidates enable row level security;
alter table public.endorsements enable row level security;
alter table public.news_items enable row level security;
alter table public.polls enable row level security;

create policy "public read elections"     on public.elections     for select using (true);
create policy "public read jurisdictions" on public.jurisdictions for select using (true);
create policy "public read races"         on public.races         for select using (true);
create policy "public read candidates"    on public.candidates    for select using (true);
create policy "public read endorsements"  on public.endorsements  for select using (true);
create policy "public read news"          on public.news_items    for select using (true);
create policy "public read polls"         on public.polls         for select using (true);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │  Touch trigger — keep updated_at fresh                          │
-- ╰──────────────────────────────────────────────────────────────────╯
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger races_touch     before update on public.races     for each row execute function public.touch_updated_at();
create trigger candidates_touch before update on public.candidates for each row execute function public.touch_updated_at();
