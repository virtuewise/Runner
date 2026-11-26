# Dispatch & Custody Operational Readiness

Status: PostgreSQL execution implementation exists in review branches; production pilot is NOT APPROVED.

## Dispatch invariants
- Planner output is advisory. Re-read current Runner identity, qualification, capabilities, vehicle, jurisdiction, availability and capacity inside the transaction.
- One active offer/assignment per leg. Dispatcher-scoped idempotency protects retries; offer expiry releases capacity; reassignment invalidates outstanding offers.
- Offer creation, audit event and outbox record commit atomically. Notification delivery is at-least-once; consumers deduplicate by stable outbox ID.
- An offer is not an assignment. Only an authenticated Runner acceptance command can assign a Runner.
- Runner capacity reservations serialize on the authoritative Runner profile row. Eligibility is re-read after the lock is acquired.

## Custody invariants
- Challenge tokens require a CSPRNG with at least 256 bits of entropy. Persist only SHA-256 digests.
- Challenges bind mission, leg(s), releasing actor, receiving actor, purpose and expiry.
- Pickup parties must be the mission requester and assigned Runner; relay parties must be the assigned Runners on both linked legs; final-delivery parties must be the assigned Runner and requester.
- Both parties authenticate and confirm the same fresh challenge. Row lock, version check, state update and immutable event append occur in one transaction.
- Expiry cleanup and reassignment invalidation prevent stale challenges from blocking or authenticating later transfers.

## Implemented engineering baseline
- PostgreSQL row-locked leg claims using `SKIP LOCKED`.
- Runner capacity serialization, assignment-time eligibility revalidation and dispatcher-scoped offer idempotency.
- Authenticated offer acceptance/decline, expiry batching and audited reassignment.
- Leased transactional outbox with at-least-once delivery, bounded retry and dead-letter state.
- PostgreSQL custody persistence, two-party confirmation, production Web Crypto token generation, SHA-256 digests, expiry cleanup and invalidation.
- CI workflow provisions ephemeral PostgreSQL, applies migrations and runs integration scenarios.

## Release gates still open
1. Wire the application identity provider and derive actor IDs/roles exclusively from authenticated server principals. Never trust role or Runner ID supplied in request bodies.
2. Deploy supervised/scheduled dispatch, offer-expiry, custody-expiry and outbox workers with graceful shutdown and bounded concurrency.
3. Integrate a real notification provider and confidential custody-token delivery channel. Verify consumer idempotency and dead-letter replay.
4. Add rate limits, per-actor attempt budgets, provider circuit breakers and operational access controls.
5. Define queue-age, offer-conversion, assignment-conflict, expiry, outbox-age, custody-completion and dispute alerts.
6. Run dispatcher and two-party custody UAT, human fallback exercises and incident simulations.
7. Complete privacy/security review, penetration testing, load testing and jurisdiction-specific operational/legal review.

## Rollout
Shadow evaluation → dispatcher-assisted offers → limited automation behind a feature flag → controlled zone expansion. Keep manual dispatch and trust-operator override available with immutable audit trails.

## Known limitations
This is not a deployed dispatch service. The repository exposes injected PostgreSQL pool adapters; deployment configuration, identity-provider integration, worker supervision, notification-provider integration, rate limiting, production alerting and operational UAT remain outstanding. CI integration tests do not establish production load capacity, external delivery guarantees, physical proof of custody or jurisdictional approval.
