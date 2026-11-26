# ADR-0010: Audited incident management and mission safety holds

- Status: Proposed for review
- Date: 2026-11-26

## Context

A movement network needs a first-class way to record safety reports, loss/damage claims, delays, custody disputes and suspected fraud. These records must be attributable, replay-safe and auditable. A mission must be pausable by an authorized trust operator without relying on client-side state.

## Decision

- Persist incidents in PostgreSQL with mission/optional leg association, reporter identity and role, category, severity, lifecycle status, optimistic version and controlled resolution fields.
- Authorize requesters against mission ownership and Runners against active assignment to a mission leg. Dispatcher/trust roles are accepted only when supplied by the verified server-side principal.
- Make incident reporting idempotent per mission, reporter and idempotency key.
- Keep incident events append-only and sequence them per incident.
- Restrict triage, investigation, resolution and dismissal to trust operators, with expected-version checks and mandatory resolution code/note for terminal outcomes.
- Provide an explicit trust-operator safety-hold command. It updates mission status and appends the mission event within one transaction; terminal missions cannot be held.
- Store only opaque evidence references in incident records. Raw media, credentials, tokens and sensitive personal data belong in separately governed evidence systems.
- Do not automatically remove a safety hold when an incident is resolved; that requires a separate authorized mission-state decision.

## Consequences

This establishes a durable trust-operations foundation but not a complete case-management product. Evidence upload/retention, notifications, assignment queues, escalation SLAs, incident dashboards, audit exports and UAT remain future work. A production identity provider and HTTP deployment are still required.
