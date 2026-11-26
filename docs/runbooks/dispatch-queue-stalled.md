# Runbook: Dispatch queue stalled

Status: Initial procedure for the PostgreSQL execution adapter. Use only in a deployed environment whose migration version and adapter build have been verified.

## Impact and detection
- Open legs age beyond the zone's dispatch SLO.
- Runner offers stop being created or acceptance conflicts increase.
- Queue workers are alive but make no progress.

## Diagnosis
1. Confirm the incident zone, affected mission/leg IDs and current build/migration versions.
2. Check worker health, database connectivity, pool saturation, lock waits and recent deployment changes.
3. Inspect queue age:
   `select status,count(*),min(created_at) from public.mission_legs where status in ('open','assigned') group by status;`
4. Inspect offer lifecycle:
   `select status,count(*),min(created_at) from public.dispatch_offers where created_at > now()-interval '24 hours' group by status;`
5. Inspect outbox backlog:
   `select event_type,count(*),min(available_at) from public.transactional_outbox where published_at is null and dead_lettered_at is null group by event_type;`
6. Check `pg_stat_activity` for long-running transactions and lock waits. Do not terminate transactions until the owner and business impact are understood.

## Mitigation
- Keep dispatch in dispatcher-assisted/manual mode while automation is impaired.
- Restore database/provider connectivity or worker capacity through the approved deployment process.
- Never bypass identity, qualification, screening, capability, jurisdiction, availability, service-window or capacity checks.
- Do not manually set a leg to `assigned` or change offer state without the approved audited command path.
- Allow expired leases and idempotent retries to recover; avoid creating replacement offers until the prior leg/offer state is reconciled.

## Recovery and rollback
1. Reconcile mission legs, active offers, Runner capacity and append-only mission events.
2. Confirm there is at most one active offer/assignment per leg.
3. Replay outbox messages only after checking downstream idempotency; use the outbox dead-letter runbook.
4. Disable automated dispatch behind the feature flag if integrity is uncertain; do not roll back or rewrite mission history.
5. Verify queue age falls, offers can be accepted and no duplicate assignments were created.

## Escalation
Escalate to Trust if a Runner was assigned outside eligibility, a custody challenge is affected, or an operator override is requested. Record root cause, affected mission IDs, operator actions and recovery evidence.
