-- RUNNER execution infrastructure: dispatch availability, idempotent offers and outbox leases.
-- Depends on 202611250001_mission_persistence.sql and 202611260001_dispatch_custody.sql.
begin;

alter table public.runner_profiles
  add column max_active_legs integer not null default 1 check (max_active_legs between 1 and 100);

create table public.runner_availability_windows (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.runner_profiles(runner_id) on delete restrict,
  available_from timestamptz not null,
  available_until timestamptz not null,
  status text not null default 'available' check (status in ('available','unavailable','cancelled')),
  created_at timestamptz not null default now(),
  check (available_until > available_from)
);
create index runner_availability_lookup_idx
  on public.runner_availability_windows (runner_id, available_from, available_until)
  where status='available';

alter table public.mission_legs
  add column service_window_start timestamptz not null default now(),
  add column service_window_end timestamptz not null default (now() + interval '1 hour'),
  add constraint mission_leg_service_window_valid check (service_window_end > service_window_start);

alter table public.dispatch_offers
  add column dispatcher_id uuid,
  add column idempotency_key text;
create unique index dispatch_offer_idempotency_unique
  on public.dispatch_offers(dispatcher_id,idempotency_key)
  where dispatcher_id is not null and idempotency_key is not null;

alter table public.transactional_outbox
  add column lease_until timestamptz,
  add column dead_lettered_at timestamptz;
create index transactional_outbox_lease_idx
  on public.transactional_outbox(lease_until)
  where published_at is null and dead_lettered_at is null;

commit;
