# Mission Engine — domain contract

**Status:** First executable domain slice  
**Scope:** Pure TypeScript domain logic; no database, network, payment provider or UI dependency.

## Implemented

- Typed mission terms, quote, lifecycle, Runner qualification and audit event contracts.
- Explicit lifecycle transition allow-list.
- Requester ownership checks for creation and publication; quote attachment is restricted to the trusted pricing service and validates the full monetary breakdown.
- Dispatch/system role gate for assignment; Runner identity, qualification, activity, capability and jurisdiction checks.
- Trust-operator-only safety/dispute/closure actions.
- Expected-version checks to reject stale writes.
- PostgreSQL unit-of-work adapter for transactional mission writes, event appends, authoritative Runner eligibility reads and idempotency receipt replay.
- Quote calculation in integer minor currency units, with a versioned pricing policy and explicit expiry.
- Audit event envelopes with actor, event ID, idempotency key, sequence and timestamp.
- Node test suite for core happy paths and rejection cases.

## Lifecycle

`draft → quoted → open → assigned → runner_en_route → at_pickup → in_custody → en_route_to_destination → delivered → closed`

Exceptional states are explicit and policy-gated: `cancelled`, `expired`, `failed`, `disputed`, `safety_hold`.

## Important boundary

This is the domain decision layer, not yet a production dispatch service. The API must call the PostgreSQL unit-of-work adapter so idempotency receipts, event appends and mission projection updates commit atomically. It must apply authorization from authenticated server-side identity and reject stale versions with compare-and-swap semantics. The client must never be trusted to supply its own role or eligibility claims.

Runner assignment currently checks the declared qualification snapshot passed to the domain function. Production must load that snapshot from authoritative verification and qualification records at assignment time.

Pricing is deterministic but intentionally policy-driven. Distance, currency, tax, insurance, weight bands, jurisdiction rules and Runner reward strategy need a launch-market policy review before customer-facing use. No live quote is currently offered.

## Run locally

Use Node.js 22.13 or newer:

```bash
npm install
npm test
npm run typecheck
```

The repository still needs SDK-aware Expo dependency alignment and a generated lockfile before native build validation. The test suite has been authored but has not been executed in this environment.
