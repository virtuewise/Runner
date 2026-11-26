# Changelog

## Unreleased — Live Network Operations foundation

- Added consent-gated Runner location ingestion, authenticated consent read/enable/withdraw controls and transactional availability windows.
- Added PostgreSQL Runner availability, offer inbox, mission tracking and dispatcher queue read models.
- Added authenticated Fetch API handler factories for availability controls, offer responses, mission tracking, dispatcher operations, incident reporting, incident transitions and safety holds.
- Added transactional incident/dispute persistence, append-only incident events, trust-operator resolution and idempotent mission safety holds.
- Added location privacy, consent, authorization and read-model tests plus ADR-0008/0009.

Not a production release. Identity provider integration, mounted HTTP server, consent UX, scheduled expiry, realtime delivery, dispatcher/Runner UI, security review and UAT remain outstanding.

## Unreleased

### Added
- Expo application foundation and product/engineering baseline.
- Mission domain engine, pricing, relay candidate planner and PostgreSQL persistence foundation.
- Framework-neutral mission API for authenticated mission creation, quote, publication and authorized reads.
- End-to-end documentation lifecycle, ADRs, RFCs, security, quality and operations templates.

### Validation
- Mission domain and API tests pass in GitHub Actions.
- TypeScript typecheck passes in GitHub Actions.

### Not available yet
- Production deployment, live identity provider, dispatch workers, custody challenge service, payments, production routing and operational dashboards.
## Unreleased — Dispatch & Custody milestone

- Added dispatch-offer and two-party custody domain orchestration contracts.
- Added a PostgreSQL schema extension for offers, transactional outbox records and custody challenge metadata.
- Added focused dispatch/custody tests and a mission-engine CI workflow.
- Added operational readiness gates and ADRs for dispatch and custody.

This is not a production release: PostgreSQL adapters, offer acceptance/expiry workers, notification delivery, authentication integration and deployed infrastructure remain outstanding.


## Unreleased — PostgreSQL execution infrastructure

- Added PostgreSQL-backed dispatch and custody repository adapters.
- Added authenticated offer acceptance/decline, expiry, reassignment invalidation and dispatcher-scoped idempotency.
- Added a leased transactional outbox worker with retry and dead-letter handling.
- Added a production Web Crypto token generator and SHA-256 custody digest adapter.
- Added PostgreSQL migration and concurrency integration coverage to CI.
- Added ADR-0006/0007 and an outbox dead-letter runbook.

Not a production release. Provider wiring, production identity integration, supervised workers, load/security testing and operational UAT remain outstanding.
