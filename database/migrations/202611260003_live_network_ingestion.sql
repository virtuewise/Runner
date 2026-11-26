-- RUNNER live network ingestion foundation.
-- Stores only the latest consented Runner position; historical breadcrumb storage is intentionally excluded.
begin;
create table public.runner_location_sharing (
  runner_id uuid not null references public.runner_profiles(runner_id) on delete restrict,
  purpose text not null check (purpose in ('active_mission')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (runner_id,purpose)
);
create table public.runner_location_snapshots (
  runner_id uuid primary key references public.runner_profiles(runner_id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_metres real not null check (accuracy_metres > 0 and accuracy_metres <= 100),
  heading_degrees real check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  speed_metres_per_second real check (speed_metres_per_second is null or (speed_metres_per_second >= 0 and speed_metres_per_second <= 100)),
  captured_at timestamptz not null,
  received_at timestamptz not null,
  expires_at timestamptz not null,
  sequence bigint not null check (sequence > 0),
  check (expires_at > received_at),
  check (captured_at <= received_at + interval '2 minutes')
);
create index runner_location_freshness_idx on public.runner_location_snapshots(expires_at,received_at);
comment on table public.runner_location_snapshots is
  'Latest consented active-mission position only. No continuous route history. Expire/delete snapshots after mission need ends.';
comment on table public.runner_location_sharing is
  'Explicit Runner-controlled purpose-limited location sharing. Disabled unless opted in.';
commit;
