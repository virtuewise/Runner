# Security, Privacy & Threat Model

Status: Baseline documented; threat workshop and provider configuration pending. Owner: Security / Engineering.

## Assets and boundaries

Identity credentials, contact details, addresses, manifests, values, Runner location, custody evidence, payout and disputes. Boundaries: client/API; API/identity; API/database; dispatch/devices; external screening/maps/notifications/payments.

## Threat controls

Account takeover: secure sessions, MFA options and revocation. BOLA/IDOR: resource-level authorization on every request. Forged eligibility: server-owned verification. Unsafe items: fail-closed screening and escalation. Duplicate dispatch: transaction/CAS/idempotency. False custody: two-party confirmation, expiry and replay protection. Location spoofing: freshness/plausibility checks. Data leakage: minimization, encryption and retention. API abuse: rate limits and payload caps. Insider misuse: least privilege and audited admin actions.

## Baseline requirements

TLS in transit, encryption at rest, no secrets in source/logs, strict validation, safe errors, rate limits, correlation IDs, retention schedules, privileged audit, dependency scanning and incident response.

## Privacy and compliance

POPIA/GDPR applicability requires qualified counsel based on geography, controller/processor roles and data flows. This document is not a compliance certification. Complete data inventory, lawful basis, privacy notice, rights process, cross-border transfer review and DPIA where appropriate.

## Release blockers

Identity verification, resource authorization, secrets, encryption, backups, retention, incident process and independent security review.