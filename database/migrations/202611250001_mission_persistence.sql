-- RUNNER Mission Engine persistence baseline (PostgreSQL)
-- Apply through the migration runner; do not execute manually in production.
begin;

create extension if not exists pgcrypto;

create table public.runner_profiles (
  runner_id uuid primary key,
  identity_status text not null check (identity_status in ('unverified','pending','verified','rejected','expired')),
  qualification_status text not null check (qualification_status in ('pending','qualified','suspended','revoked')),
  is_active boolean not null default false,
  trust_tier text not null default 'new',
  max_declared_value_minor bigint not null default 0 check (max_declared_value_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runner_capabilities (
  runner_id uuid not null references public.runner_profiles(runner_id) on delete restrict,
  capability_code text not null,
  status text not null check (status in ('pending','verified','suspended','revoked')),
  valid_until timestamptz,
  primary key (runner_id, capability_code)
);

create table public.runner_jurisdictions (
  runner_id uuid not null references public.runner_profiles(runner_id) on delete restrict,
  country_code char(2) not null,
  status text not null check (status in ('pending','approved','suspended','revoked')),
  primary key (runner_id, country_code)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  status text not null check (status in (
    'draft','quoted','open','matching','assigned','runner_en_route','at_pickup',
    'in_custody','en_route_to_destination','delivered','closed','cancelled',
    'expired','failed','disputed','safety_hold','customs_hold'
  )),
  category text not null check (category in ('document','parcel','retail_collection','other')),
  manifest jsonb not null,
  pickup jsonb not null,
  destination jsonb not null,
  declared_value_minor bigint not null check (declared_value_minor >= 0),
  currency char(3) not null check (currency = upper(currency)),
  quote jsonb,
  assigned_runner_id uuid references public.runner_profiles(runner_id) on delete restrict,
  pricing_version text,
  quote_expires_at timestamptz,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index missions_dispatch_queue_idx
  on public.missions (status, created_at)
  where status in ('open','matching');

create index missions_requester_created_idx
  on public.missions (requester_id, created_at desc);

create table public.mission_legs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete restrict,
  leg_number integer not null check (leg_number > 0),
  mode text not null check (mode in ('foot','bicycle','motorcycle','car','van','rail','air','other')),
  status text not null check (status in (
    'planned','open','assigned','runner_en_route','at_pickup','in_custody',
    'en_route_to_handover','handover_pending','delivered','cancelled',
    'failed','safety_hold','customs_hold'
  )),
  origin jsonb not null,
  destination jsonb not null,
  jurisdiction_codes text[] not null default '{}',
  assigned_runner_id uuid references public.runner_profiles(runner_id) on delete restrict,
  estimated_distance_metres integer check (estimated_distance_metres is null or estimated_distance_metres >= 0),
  sequence_version bigint not null default 0 check (sequence_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, leg_number)
);

create index mission_legs_runner_active_idx
  on public.mission_legs (assigned_runner_id, status)
  where assigned_runner_id is not null and status not in ('delivered','cancelled','failed');

create table public.custody_handovers (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete restrict,
  from_leg_id uuid references public.mission_legs(id) on delete restrict,
  to_leg_id uuid references public.mission_legs(id) on delete restrict,
  releasing_actor_id uuid not null,
  receiving_actor_id uuid not null,
  token_hash bytea not null,
  evidence_type text not null check (evidence_type in ('rotating_qr','nfc_challenge','dual_confirmation','operator_override')),
  status text not null check (status in ('initiated','confirmed','rejected','expired','disputed')),
  release_confirmed_at timestamptz,
  receive_confirmed_at timestamptz,
  evidence_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (token_hash),
  check (from_leg_id is null or to_leg_id is null or from_leg_id <> to_leg_id),
  check (releasing_actor_id <> receiving_actor_id)
);

create index custody_handovers_mission_idx
  on public.custody_handovers (mission_id, created_at);

create table public.mission_events (
  event_id uuid primary key,
  mission_id uuid not null references public.missions(id) on delete restrict,
  sequence bigint not null check (sequence > 0),
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('requester','runner','dispatcher','trust_operator','system')),
  event_type text not null,
  idempotency_key text not null,
  from_status text,
  to_status text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (mission_id, sequence),
  unique (mission_id, actor_id, idempotency_key)
);

create index mission_events_timeline_idx
  on public.mission_events (mission_id, sequence);

-- Idempotency receipts let API retries return the original result without repeating work.
create table public.idempotency_receipts (
  actor_id uuid not null,
  scope text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  response_status integer,
  response_body jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (actor_id, scope, idempotency_key)
);

-- Audit history is append-only. Corrections must be represented by new events.
create function public.reject_mission_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'mission_events is append-only';
end;
$$;

create trigger mission_events_no_update
  before update or delete on public.mission_events
  for each row execute function public.reject_mission_event_mutation();

create trigger mission_events_no_truncate
  before truncate on public.mission_events
  for each statement execute function public.reject_mission_event_mutation();

commit;
