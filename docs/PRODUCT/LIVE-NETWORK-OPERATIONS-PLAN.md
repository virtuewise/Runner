# Live Network Operations & Runner Experience

Status: proposed milestone plan; delivery is staged and no production launch is approved.

## Product outcome

Make the execution engine operationally legible to Runners, dispatchers, requesters and trust operators without weakening server authority, privacy or auditability.

## Delivery sequence

1. **Network ingestion and API foundation** — consented Runner location, availability windows, freshness/sequence validation, expiry, privacy boundaries, authenticated offer inbox/response handlers, tracking and dispatcher read models.
2. **Runner experience** — availability controls, offer inbox, offer detail, accept/decline, mission checklist and custody QR/NFC handover surfaces.
3. **Dispatcher command centre** — dispatch queue, eligible Runner capacity, offer state, mission/relay timeline, stale-location warnings and controlled reassignment.
4. **Mission tracking** — requester and operations views over authoritative mission/leg events; location is supplemental and freshness-labelled.
5. **Trust operations** — incident intake, safety holds, disputes, evidence preservation, escalation and resolution audit.
6. **Realtime and resilience** — authenticated event stream, reconnect/replay cursors, offline-safe read state and alerting.

## Cross-cutting requirements

- PostgreSQL remains the source of truth.
- Every command is authenticated, authorized, idempotent where retryable, and audited.
- Client state is a projection, never authoritative.
- Location is purpose-limited, consented, freshness-aware and not retained as breadcrumbs by default.
- Custody requires explicit two-party evidence; GPS alone never confirms possession.
- Relay legs remain independently eligible and version-checked.
- Privacy, accessibility, localization, observability and abuse controls are part of acceptance criteria.

## Current slice

The current engineering slice establishes Runner location/availability persistence, authenticated Fetch API handler factories, Runner offer inbox/accept-decline operations, requester/Runner mission tracking and dispatcher queue read models. It does not include a production identity provider, consent UX, mounted HTTP server, realtime transport, dispatcher dashboard UI, expiry worker or production deployment.
