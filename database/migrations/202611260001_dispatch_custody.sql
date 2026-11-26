-- RUNNER dispatch offers, transactional outbox and hardened custody challenges.
-- Apply through the migration runner after 202611250001_mission_persistence.sql.
begin;
create table public.dispatch_offers (
  id uuid primary key, mission_id uuid not null references public.missions(id) on delete restrict,
  leg_id uuid not null references public.mission_legs(id) on delete restrict,
  runner_id uuid not null references public.runner_profiles(runner_id) on delete restrict,
  status text not null check (status in ('offered','accepted','declined','expired','revoked')),
  expires_at timestamptz not null, created_at timestamptz not null default now(), responded_at timestamptz,
  version bigint not null default 1 check (version > 0), check (expires_at > created_at)
);
create unique index dispatch_one_live_offer_per_leg on public.dispatch_offers (leg_id)
  where status in ('offered','accepted');
create index dispatch_offers_runner_inbox_idx on public.dispatch_offers (runner_id, created_at desc) where status = 'offered';
create index dispatch_offers_expiry_idx on public.dispatch_offers (expires_at) where status = 'offered';
create table public.transactional_outbox (
  id uuid primary key, aggregate_id uuid not null, event_type text not null, payload jsonb not null,
  created_at timestamptz not null default now(), available_at timestamptz not null default now(),
  published_at timestamptz, attempts integer not null default 0 check (attempts >= 0), last_error_code text,
  unique (aggregate_id, event_type)
);
create index transactional_outbox_pending_idx on public.transactional_outbox (available_at, created_at)
  where published_at is null;
alter table public.custody_handovers
  add column challenge_id uuid unique,
  add column purpose text check (purpose in ('pickup','relay_handover','final_delivery')),
  add column expires_at timestamptz,
  add column version bigint not null default 1 check (version > 0),
  add column invalidated_at timestamptz;
create index custody_handovers_pending_expiry_idx on public.custody_handovers (expires_at) where status = 'initiated';
create unique index custody_one_pending_challenge_per_transfer
  on public.custody_handovers (mission_id,
    coalesce(from_leg_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(to_leg_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'initiated' and invalidated_at is null;
commit;
