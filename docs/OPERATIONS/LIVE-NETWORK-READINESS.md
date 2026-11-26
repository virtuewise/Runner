# Live Network Operations Readiness

Status: engineering foundation only; not production-ready.

## Implemented in the current engineering slice

- Authenticated-principal-shaped domain boundary for Runner location and availability commands.
- Location validation: coordinate ranges, <=100m reported accuracy, <=5-minute age, <=2-minute future skew, positive monotonic sequence, bounded optional speed and heading.
- Explicit purpose-scoped sharing flag; PostgreSQL writes fail closed when active-mission sharing is not enabled.
- Latest-location snapshot only, with expiry. No location breadcrumb history.
- Transactional availability-window replacement for a Runner.
- PostgreSQL read models for Runner availability, unexpired offer inbox, mission/relay timeline and dispatcher queue.
- Read access is scoped to the verified requester/Runner principal; dispatcher queue requires dispatcher or trust-operator role.
- Fresh location is included only while consent is enabled and the stored snapshot has not expired.
- Fetch API handler factories for Runner availability, offer accept/decline, mission tracking and dispatcher queue, with injected authentication and repositories.
- Unit and ephemeral PostgreSQL integration tests cover the read models and authenticated handler boundaries.

## Operational interface foundation

- Presentational Runner offer inbox, dispatcher command-centre and mission/relay timeline components are available under `src/ui/operations`.
- Components consume typed backend read models and explicit action callbacks; they do not invent live data or own authorization.
- The existing landing page explicitly labels its sample missions and network status as demo/preview data.

## Incident and dispute foundation

- PostgreSQL incident records with reporter identity/role, category, severity, optimistic version and controlled resolution.
- Append-only incident event history.
- Reporter authorization for requester-owned missions and assigned Runner legs.
- Trust-operator-only incident transitions and mission safety holds.
- Evidence is represented only by opaque references; raw media and sensitive personal data are not stored in incident metadata.
- Safety holds update the mission projection and append a mission event in one transaction.

## Still required before live use

- Production authentication and resource authorization; the API must supply the verified Runner principal.
- Authenticated consent enable/withdraw endpoint and consent notice/purpose review.
- Scheduled deletion/expiry worker and privacy retention policy.
- Location spoofing/plausibility controls, device attestation assessment and abuse monitoring.
- Rate limits, payload limits, telemetry minimization and security review.
- Realtime transport, dispatcher UI and read-model freshness/accuracy presentation.
- Wiring the presentational components to a production API/auth session, location consent UX, custody scan workflow, incident intake/triage console, incident escalation and operational training.
- POPIA/GDPR legal review for applicable data flows and cross-border processing.

GPS is supporting situational data only. It never proves pickup, transfer or delivery.
