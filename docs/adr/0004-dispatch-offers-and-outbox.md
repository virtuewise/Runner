# ADR-0004: Transactional Dispatch Offers and Outbox

Status: Accepted for the initial dispatch boundary. Date: 2026-11-26.

## Context
Relay plans are candidates, not authority to assign. Dispatch must survive concurrent workers, retries and notification-provider failure without creating duplicate active assignments or losing audit history.

## Decision
Use PostgreSQL transactions as the dispatch coordination boundary. Workers lock eligible open legs, re-read authoritative Runner eligibility, create a time-limited offer, append an audit event and enqueue a transactional outbox record in one commit. Offer acceptance remains a separate authenticated command. Enforce one live offer per leg with a database uniqueness constraint and use idempotency keys for commands.

## Consequences
- The initial design stays within the modular monolith and avoids a distributed queue dependency.
- Outbox delivery is at-least-once; consumers must deduplicate.
- A production adapter, acceptance/decline handlers, expiry worker, cancellation invalidation and real PostgreSQL concurrency tests are required before pilot.
- Candidate selection and route planning never replace assignment-time validation.
