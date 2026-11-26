# ADR-0005: Two-Party Verifiable Custody Challenges

Status: Accepted for the initial custody boundary. Date: 2026-11-26.

## Context
A custody record without fresh, attributable consent does not prove a physical transfer. Challenges must be bound to the intended mission, leg, parties, purpose and time window, and must resist replay.

## Decision
Use short-lived, cryptographically random single-use challenges with at least 256 bits of entropy. Persist only a one-way digest. Require both the releasing and receiving authenticated actors to confirm. Confirmation is a row-locked, version-checked transaction that appends immutable events with the state update. Reject wrong parties, expired challenges, repeated party confirmations and completed-challenge replays.

## Consequences
- Crypto generation, digest comparison and persistence are injected ports; production implementations must use a CSPRNG, SHA-256 or stronger, and constant-time digest comparison.
- Pending challenges must be invalidated on cancellation, reassignment or dispute.
- Rate limiting, offline protocol, evidence attachments, retention and legal admissibility remain open design/review items.
- No production readiness is implied by the domain contract alone.
