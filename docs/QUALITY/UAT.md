# User Acceptance Testing

Status: Template; no UAT sign-off recorded. Owner: Product / Operations.

Test roles: requester, Runner, dispatcher and trust operator using synthetic data.

Scenarios: valid mission and quote; unsafe manifest rejection; publish and discover; eligible/ineligible assignment; two-party custody; Runner cancellation and late arrival; connectivity loss; damage/loss dispute; access-control isolation; screen-reader and text-scaling usability.

Record test ID, build SHA, environment, tester role, result, evidence, defect IDs and product owner approval. Automated CI is not UAT sign-off.

## Dispatch & relay execution scenarios

- Two dispatcher workers claim at least two eligible legs concurrently; no leg receives more than one live offer.
- Two simultaneous retries with the same dispatcher/idempotency key return the same offer and do not consume another leg.
- A Runner who becomes suspended, loses a capability/jurisdiction, exceeds capacity or loses availability before acceptance is rejected.
- Only the Runner identity authenticated by the server can accept or decline its offer.
- Expired offers release the capacity reservation and remain auditable.
- Reassignment revokes pending/accepted offers, clears the prior leg assignment, invalidates related custody challenges and records actor, reason and idempotency key.
- Worker crash after provider publication is recovered safely through outbox lease expiry and consumer deduplication.
- Provider outage drives bounded retries and dead-letter handling without changing mission state.

## Verifiable custody scenarios

- Pickup: only the mission requester and assigned Runner can participate.
- Relay: releasing and receiving parties must be the assigned Runners on the two linked legs of the same mission.
- Final delivery: only the assigned Runner and mission requester can participate.
- Both parties confirm the same unexpired challenge; the handover is committed exactly once.
- Wrong party, wrong token, duplicate party confirmation, expired token and completed-challenge replay are rejected.
- Reassignment invalidates an outstanding challenge; scheduled expiry clears stale pending challenges.
- Confirmations and invalidation remain auditable after application retries and worker restarts.

Record the exact migration version, PostgreSQL version, build SHA and anonymized evidence for each scenario. UAT requires Operations and Trust sign-off; CI success alone does not approve a pilot.
