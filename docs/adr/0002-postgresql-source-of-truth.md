# ADR-0002: PostgreSQL is the transactional source of truth

Status: Accepted. Date: 2026-11-26. Owner: Engineering.

## Context

Mission state, assignments, idempotency and custody require transactions and relational constraints.

## Decision

Use PostgreSQL as authoritative store, append-only mission events for audit, and transactional outbox when downstream publishing is introduced. Do not add Redis, Kafka, Cassandra or geospatial extensions without measured need.

## Alternatives

Cassandra deferred for transactional relational invariants; Redis rejected as durable mission store; full event sourcing deferred in favour of relational projections plus append-only event history.

## Consequences

Transactions and constraints support integrity; migrations, backups, query plans and connection pooling become critical.

## Security / operations

Least-privilege roles, TLS, managed secrets, retention and tested backups are production requirements.

## Review triggers

Measured partitioning, spatial, cache, read replica or queue needs.