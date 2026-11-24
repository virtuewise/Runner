# RUNNER relay architecture

**Status:** Domain and persistence design baseline

## Product model

A long-distance mission is a parent mission composed of ordered legs. Each leg has its own mode, origin, destination, jurisdiction set, assigned Runner and lifecycle. A relay is not a loose chain of informal transfers: it is a planned and authorized sequence of custody obligations.

## Core invariants

1. A mission is not complete until every required leg is delivered and the final recipient handover is confirmed.
2. Exactly one active Runner owns custody of a given leg at a time.
3. A leg-to-leg transfer requires distinct releasing and receiving identities and explicit confirmation from both sides.
4. The next leg cannot enter custody until the preceding handover is confirmed.
5. GPS, proximity, QR scans and NFC are supporting evidence; none alone proves lawful possession or delivery.
6. A Runner must be independently qualified for the specific mode, item class and jurisdiction of the leg.
7. Cross-border legs remain blocked until customs, aviation/security, sanctions, insurance and jurisdiction policies are explicitly satisfied.
8. Every command uses an idempotency key and expected version. Projection writes and event appends must commit atomically.

## Multi-hop planning

The first production planner should optimize for feasibility and accountable handoffs, not raw geographic distance alone. Candidate edges need:
- A verified Runner or approved carrier with a declared service window.
- A permitted transport mode and verified capability.
- Feasible departure/arrival windows and handover buffer.
- Jurisdiction and item-policy compatibility.
- A safe, staffed or otherwise approved transfer location.
- Cost, reliability and maximum custody duration.

A shortest-path algorithm can rank feasible candidate routes, but policy filtering must happen before scoring. The planner must not invent a flight itinerary or treat a traveler's personal booking as an approved logistics edge.

## Data ownership

- `missions`: parent request, declared manifest, route endpoints, quote and aggregate lifecycle.
- `mission_legs`: ordered route segments and per-leg Runner assignment.
- `custody_handovers`: two-party handoff state and hash of a one-time challenge token.
- `mission_events`: append-only audit timeline.
- `idempotency_receipts`: API retry protection and response replay.

## Security and privacy

Store only a cryptographic hash of handover tokens. Generate high-entropy, short-lived challenges server-side, bind them to a specific mission, leg pair and two actors, and rate-limit attempts. Do not put raw tokens, full identity documents or precise location trails into event payloads. Restrict location retention and access by active mission role.

The migration is a schema baseline, not a production-ready deployment. Before production, add provider-specific authentication mapping, row-level security, least-privilege grants, encryption/retention policies, backup/restore drills and jurisdiction-specific compliance review.
