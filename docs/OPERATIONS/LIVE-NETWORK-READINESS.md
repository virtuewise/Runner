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

## Still required before live use

- Production authentication and resource authorization; the API must supply the verified Runner principal.
- Authenticated consent enable/withdraw endpoint and consent notice/purpose review.
- Scheduled deletion/expiry worker and privacy retention policy.
- Location spoofing/plausibility controls, device attestation assessment and abuse monitoring.
- Rate limits, payload limits, telemetry minimization and security review.
- Realtime transport, dispatcher UI and read-model freshness/accuracy presentation.
- Runner mobile UX, dispatcher UI, incident escalation and operational training.
- POPIA/GDPR legal review for applicable data flows and cross-border processing.

GPS is supporting situational data only. It never proves pickup, transfer or delivery.
