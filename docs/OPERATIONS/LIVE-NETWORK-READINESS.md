# Live Network Operations Readiness

Status: engineering foundation only; not production-ready.

## Implemented in the initial ingestion slice

- Authenticated-principal-shaped domain boundary for Runner location and availability commands.
- Location validation: coordinate ranges, <=100m reported accuracy, <=5-minute age, <=2-minute future skew, positive monotonic sequence, bounded optional speed and heading.
- Explicit purpose-scoped sharing flag; PostgreSQL writes fail closed when active-mission sharing is not enabled.
- Latest-location snapshot only, with expiry. No location breadcrumb history.
- Transactional availability-window replacement for a Runner.

## Still required before live use

- Production authentication and resource authorization; the API must supply the verified Runner principal.
- Authenticated consent enable/withdraw endpoints, consent notice and purpose review.
- Scheduled deletion/expiry worker and privacy retention policy.
- Location spoofing/plausibility controls, device attestation assessment and abuse monitoring.
- Rate limits, payload limits, telemetry minimization and security review.
- Realtime transport and dispatcher read model with freshness/accuracy labels.
- Runner UX, dispatcher UAT, incident escalation and operational training.
- POPIA/GDPR legal review for applicable data flows and cross-border processing.

GPS is supporting situational data only. It never proves pickup, transfer or delivery.
