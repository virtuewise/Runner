# ADR-0001: Start with a modular monolith

Status: Accepted. Date: 2026-11-26. Owner: Engineering.

## Context

Mission, assignment, custody and audit need transactional consistency. Operating assumptions are early and unvalidated. Premature service decomposition adds distributed failure modes.

## Decision

Use a modular TypeScript backend with explicit domain boundaries and ports/adapters. Extract services only when measured scaling, ownership, deployment isolation or security boundaries justify it.

## Alternatives

Microservices from day one rejected due to operational and distributed transaction cost. Unstructured monolith rejected due to weak domain boundaries. Multiple languages deferred until measured need.

## Consequences

One deployable backend simplifies transactions; modules must not bypass domain boundaries. Extraction remains possible later.

## Security / operations

Centralize authorization and audit semantics. Start with one application and PostgreSQL; add infrastructure only when justified.

## Review triggers

Sustained load, independent team ownership, deployment isolation or blast-radius needs.