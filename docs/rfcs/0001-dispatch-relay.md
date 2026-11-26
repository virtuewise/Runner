# RFC-0001: Dispatch & Relay Execution

Status: Proposed. Owner: Backend / Dispatch.

## Problem

Relay planner produces candidate routes, not live assignments. Need transactional queue claims, eligibility revalidation, expiry and recovery.

## Proposal

Start with PostgreSQL-backed dispatch in the modular monolith. Claim a leg transactionally with row lock/CAS, revalidate Runner and leg constraints, append assignment event and transactional outbox record. Use bounded workers and idempotent commands.

## Invariants

At most one active Runner per leg; only dispatch authority assigns; recheck screening, capability, vehicle, jurisdiction, time and capacity; expired offers release capacity audibly; every reassignment has actor/reason; planner output never authorizes dispatch.

## Verification and rollout

Test worker crashes, duplicate delivery, Runner ineligibility, cancellation races, stale location, PostgreSQL concurrency, queue age and operator UAT. Shadow evaluation → dispatcher-assisted → limited automation behind flag → zone expansion. Human override remains.