# Test Strategy

Status: Domain/API tests exist; PostgreSQL integration and E2E suites pending. Owner: Quality Engineering.

## Layers

Unit: domain, pricing, relay and policy. Repository integration: real migrations, rollback, row locks, CAS, idempotency and append-only constraints. API integration: authenticated production-equivalent adapter. Contract: OpenAPI compatibility. E2E: requester, Runner, dispatcher and trust journeys. Operational: restore, outage, queue recovery and rollback.

## Required invariants

Unauthorized access denied; no duplicate leg assignment under concurrency; retries do not duplicate events or payouts; changed-body idempotency conflicts; rejected commands roll back atomically; relay legs satisfy capacity/capability/jurisdiction/time gates; custody rejects stale/replayed challenges and one-sided confirmation; terminal outcomes have attributable evidence.

## CI baseline

GitHub Actions runs Node tests and TypeScript typecheck. It does not prove real PostgreSQL compatibility, Expo native builds, device behaviour, load capacity or production security.

Track invariant and negative-path coverage, not line coverage alone.