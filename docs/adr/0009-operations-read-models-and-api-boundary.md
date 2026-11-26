# ADR-0009: Authenticated operational read models and Fetch API handlers

- Status: Proposed for review
- Date: 2026-11-26

## Context

Runner offer inboxes, mission tracking and dispatcher queues need consistent projections over PostgreSQL execution state. A client must not be able to choose its own Runner identity or elevate its operational role.

## Decision

- Implement read models as parameterized PostgreSQL queries over authoritative missions, legs, offers, events, consent and latest-location tables.
- Scope Runner offer inboxes to the authenticated Runner ID.
- Scope requester tracking to the requester; Runner tracking requires assignment to at least one leg.
- Restrict dispatcher queue access to dispatcher/trust-operator principals produced by the authentication boundary.
- Include location only while its active-mission consent is enabled and its expiry is in the future.
- Provide Fetch API handler factories with injected authentication, repositories, queries and clock. They are framework/hosting independent and are not mounted on a production HTTP server by this decision.
- Use existing transactional accept/decline commands so offer responses remain authoritative and replay-safe.

## Consequences

The handlers are deployable building blocks, not a complete API deployment. Production identity, rate limiting, request tracing, transport security and endpoint mounting remain separate release gates.
