# Product Requirements Document

Status: Proposed baseline. Owner: Product. Review before each scope expansion.

## Problem

Coordinate a mission to destination, potentially through multiple independently qualified Runner legs, while preserving eligibility, custody evidence, pricing and exception accountability.

## Requirements

- PR-001: Authenticated requester creates mission with origin, destination, category, declared value, weight, service window and capabilities.
- PR-002: Server-side manifest screening; unknown or rejected decisions fail closed.
- PR-003: Trusted itemized quote with currency, validity and policy version.
- PR-004: Requester publishes a valid quoted mission.
- PR-005: Eligibility checks identity, capability, vehicle, geography, capacity and availability.
- PR-006: Relay planner proposes legs; each leg is revalidated before assignment.
- PR-007: Dispatch assignment is atomic under concurrent workers.
- PR-008: Custody transfer records both parties, time, evidence and confirmation.
- PR-009: Authorized participants receive state and exception updates.
- PR-010: Completion requires destination evidence and configured confirmation.
- PR-011: Trust operators investigate disputes with auditable actions.
- PR-012: Retryable commands support idempotency.
- PR-013: Mission personal data is least-privilege and time-bounded where practical.

## Proposed non-functional targets

| Area | Initial target | Evidence |
|---|---|---|
| Read latency | p95 <300 ms | Load test |
| Command latency | p95 <700 ms excluding providers | Load test |
| Availability | 99.9% monthly after maturity | SLI data |
| Integrity | No duplicate active assignment per leg | Concurrency test |
| Recovery | RPO 15 min / RTO 4 h | Restore exercise |

Targets are hypotheses, not measured SLAs.

## Pilot exclusions

Unrestricted international/customs-sensitive missions, high-risk goods without approved controls, autonomous dispatch without override, escrow/insurance guarantees before legal/provider review.

## Discovery questions

Which segments repeat profitably? What Runner density is needed? Which custody proofs are practical? Who bears carrier liability? What insurance, consumer and privacy duties apply? Which service promise is sustainable?