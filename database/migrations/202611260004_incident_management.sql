-- RUNNER incident and dispute management. Depends on mission and execution persistence.
begin;
create table public.mission_incidents (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete restrict,
  leg_id uuid references public.mission_legs(id) on delete restrict,
  reporter_id uuid not null,
  reporter_role text not null check (reporter_role in ('requester','runner','dispatcher','trust_operator')),
  idempotency_key text not null,
  category text not null check (category in ('safety','loss','damage','delay','custody_dispute','suspected_fraud','customs','other')),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','triaged','investigating','resolved','dismissed')),
  title text not null check (length(title) between 3 and 120),
  description text not null check (length(description) between 3 and 4000),
  evidence_refs text[] not null default '{}',
  assigned_operator_id uuid,
  resolution_code text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  version bigint not null default 1 check (version > 0),
  unique (mission_id,reporter_id,idempotency_key),
  check (cardinality(evidence_refs) <= 20),
  check ((status in ('resolved','dismissed')) = (resolved_at is not null)),
  check (status not in ('resolved','dismissed') or resolution_code is not null)
);
create index mission_incidents_queue_idx on public.mission_incidents(status,severity,created_at)
  where status in ('open','triaged','investigating');
create index mission_incidents_mission_idx on public.mission_incidents(mission_id,created_at desc);
create table public.mission_incident_events (
  event_id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.mission_incidents(id) on delete restrict,
  sequence bigint not null check (sequence > 0),
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('requester','runner','dispatcher','trust_operator','system')),
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (incident_id,sequence),
  unique (incident_id,actor_id,idempotency_key)
);
create index mission_incident_events_timeline_idx on public.mission_incident_events(incident_id,sequence);
create trigger mission_incident_events_no_update
  before update or delete on public.mission_incident_events
  for each row execute function public.reject_mission_event_mutation();
create trigger mission_incident_events_no_truncate
  before truncate on public.mission_incident_events
  for each statement execute function public.reject_mission_event_mutation();
comment on table public.mission_incidents is
  'Operational incident and dispute records. Evidence is referenced by opaque IDs; raw documents and sensitive media are stored in separately governed systems.';
comment on column public.mission_incidents.evidence_refs is
  'Opaque evidence references only. Never store raw PII, tokens, credentials or media payloads in this array.';
commit;
