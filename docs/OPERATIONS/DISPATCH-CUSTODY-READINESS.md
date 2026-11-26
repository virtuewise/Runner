# Dispatch & Custody Operational Readiness

Status: Execution infrastructure implemented in a review branch; production pilot not approved.

## Dispatch invariants
- Planner output is advisory. Re-read current Runner identity, qualification, capabilities, vehicle, jurisdiction, availability and capacity inside the assignment transaction.
- One active offer/assignment per leg. Offers expire; retries are idempotent; cancellation and reassignment invalidate outstanding offers.
- Offer creation, audit event and outbox record commit atomically. Notifications are at-least-once; consumers deduplicate by event ID.
- An offer is not an assignment. Only a separately authenticated acceptance command may assign a Runner.

## Custody invariants
- Challenge tokens require a cryptographically secure random source with at least 256 bits of entropy.
- Store only a one-way token digest. Never log plaintext tokens or include them in analytics, support tickets or event payloads.
- Bind challenges to mission, leg, sender, receiver, purpose and expiry. Require both parties to authenticate and confirm.
- Lock the challenge row, check expiry/status/party/digest, and atomically append the event and state change.
- Cancellation, leg reassignment, expiry or dispute invalidates pending challenges. Manual overrides require trust-operator identity, reason and immutable audit event.

## Operational gates before pilot
1. Implement PostgreSQL adapters for repository contracts and apply migrations in ephemeral PostgreSQL CI.
2. Implement authenticated offer acceptance, decline, expiry/recovery workers and invalidation paths.
3. Add rate limits, actor attempt budgets, notification deduplication and dead-letter/replay procedures.
4. Verify concurrent claims, duplicate events, worker crash recovery, concurrent token replay and wrong-party/expired-token rejection against PostgreSQL.
5. Instrument queue age, offer conversion, assignment conflicts, expiry, handover completion and dispute rates.
6. Complete dispatcher and two-party handover UAT; document human fallback and escalation.
7. Complete privacy/security and jurisdiction-specific operational/legal reviews.

## Rollout
Shadow evaluation → dispatcher-assisted offers → limited automation behind a feature flag → controlled zone expansion. Keep manual dispatch and trust-operator override available with audit trails.

## Implemented in the execution infrastructure branch
- PostgreSQL leg claims use row locks and `SKIP LOCKED`; Runner capacity reservations serialize on the Runner profile row.
- Dispatcher-scoped offer idempotency, authenticated runner acceptance/decline commands, expiry batching and reassignment invalidation are implemented.
- Outbox messages use leases, at-least-once publication, bounded retry and dead-letter state.
- Custody challenges use a production Web Crypto adapter, persistent SHA-256 digests, row-locked two-party confirmation and reassignment invalidation.
- CI now provisions ephemeral PostgreSQL and runs migration/concurrency integration coverage.

## Known limitations
This branch defines domain orchestration and schema extensions. Production identity-provider integration, worker supervision/scheduling, notification-provider integration, rate limiting, production deployment, alert thresholds, human fallback exercises and operational UAT remain release gates. The PostgreSQL CI suite is not a substitute for production load, security or jurisdictional validation. This is not a live dispatch service.
