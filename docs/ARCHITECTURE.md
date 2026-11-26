# RUNNER system architecture

**Status:** Initial architecture baseline  
**Date:** 2026-11-24

## Product boundary

RUNNER is a mission network for moving permitted items between people and organizations. A mission is a governed workflow with a requester, an item declaration, pickup and destination, eligibility constraints, a reward, custody events, and verifiable completion.

The product must not be modelled as a ride-hailing trip or a food order. People may act as requesters and, after qualification, as Runners.

## Initial topology

- **Client:** Expo SDK 58 / React Native 0.88 / React 19.3 / Expo Router. One universal application target for iOS, Android, and web.
- **Domain layer:** typed mission contracts and pure business rules, independent of UI and persistence.
- **Backend boundary:** separately deployable API and event-processing layer. No client may write directly to privileged tables or make trust decisions.
- **Identity and access:** verified identity, role and capability grants, device/session controls, and least-privilege authorization.
- **Data:** relational source of truth for mission state and custody events; append-only audit history for sensitive transitions.
- **Realtime:** server-authorized mission updates; location sharing only during an active, consented mission and only for authorized viewers.
- **Payments:** provider abstraction, idempotent payment intents, ledger reconciliation, refunds and dispute workflows. Never store raw card data.
- **Operations:** observability, alerting, support tooling, fraud review and incident response.

## Core domain concepts

- Account: authenticated person or organization.
- RunnerProfile: qualification status, declared capabilities, service area and reputation signals.
- VehicleProfile: optional verified transport capability.
- Mission: immutable identity and versioned terms for a movement request.
- MissionOffer: a Runner's offer or acceptance under the mission's assignment policy.
- MissionAssignment: authoritative allocation to one eligible Runner.
- CustodyEvent: pickup, transfer, exception and delivery evidence.
- MissionProof: evidence metadata and access policy; sensitive media is private by default.
- PaymentIntent and LedgerEntry: payment lifecycle and auditable money movement.
- SafetyCase: incident, prohibited-item, dispute or safeguarding workflow.

## Mission lifecycle

draft -> quoted -> open -> assigned -> runner_en_route -> at_pickup -> in_custody -> en_route_to_destination -> delivered -> closed

Exceptional states are explicit: cancelled, expired, failed, disputed, safety_hold. State changes are server-authoritative, validated against a transition table, idempotent, timestamped and attributable. Never infer custody from GPS alone.

## Non-negotiable controls

1. No mission can be accepted until the Runner meets the mission's identity, capability, vehicle and jurisdiction requirements.
2. Pickup and delivery use explicit handoff evidence (PIN/QR/signature or policy-specific proof).
3. GPS is a supporting signal, not proof of possession or delivery.
4. High-value, age-restricted, regulated, hazardous or prohibited goods require policy gates or are rejected.
5. Exact addresses and location traces are private, short-lived where possible, and never exposed in public mission discovery.
6. Money movement and mission state transitions are idempotent and auditable.
7. Rate limits, abuse controls, fraud review and emergency escalation are part of the platform—not later add-ons.

## Deployment evolution

Start with a modular monolith and a well-defined domain boundary. Split services only when independent scaling, team ownership or fault isolation justify the operational cost. Prefer managed infrastructure and portable interfaces; avoid premature microservices.

## Current implementation status

The repository contains a client foundation and design prototype. Authentication, backend persistence, dispatch, payments, identity verification, maps, push notifications and production proof-of-delivery are not yet implemented.
