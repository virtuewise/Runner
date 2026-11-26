# ADR-0006: PostgreSQL Execution Locks and Transactional Outbox

Status: Accepted for the initial execution implementation. Date: 2026-11-26.

## Context
Dispatch must remain correct under concurrent workers, while downstream notification providers may be unavailable or deliver duplicates. The existing domain contract is not sufficient unless queue claims, capacity reservations, assignment, audit and notification intent share database guarantees.

## Decision
- Claim open legs with PostgreSQL row locks and `SKIP LOCKED`.
- Serialize capacity reservations and offer acceptance by locking the authoritative Runner profile row, then re-reading eligibility in a subsequent READ COMMITTED statement.
- Count active assignments and outstanding offers against Runner capacity.
- Persist a dispatcher-scoped idempotency key on offers.
- Accept an offer only after authenticated runner identity is supplied by the application boundary and the database revalidates qualification, capability, vehicle, jurisdiction, availability and capacity.
- Write mission events and transactional outbox records in the same database transaction as the state change.
- Deliver outbox messages at least once with row leases, bounded exponential retry and dead-letter state. Consumers deduplicate by stable outbox ID.

## Consequences
- PostgreSQL is the first execution coordinator; no distributed queue is required for the initial rollout.
- Outbox publication is at-least-once, not exactly-once.
- Explicit service windows and Runner availability windows are required before a leg can be dispatched.
- Live deployment still requires connection pooling, worker supervision, alerting, dead-letter replay controls and operational UAT.
