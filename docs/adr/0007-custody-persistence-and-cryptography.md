# ADR-0007: Persistent Custody Challenges and Production Cryptography

Status: Accepted for the initial execution implementation. Date: 2026-11-26.

## Context
A custody handover is a high-trust event. Tokens must be unpredictable, secret at rest, short-lived, attributable to both participants and atomically consumed.

## Decision
- Use Node/Web Crypto CSPRNG to generate at least 256 bits of random token material.
- Persist only a SHA-256 digest in the existing custody handover table; return plaintext once to the trusted delivery channel.
- Compare fixed-length digest hex values with a constant-work XOR comparison.
- Persist challenge ID, mission, leg, participants, purpose, expiry, version and confirmation timestamps.
- Lock the custody row, enforce expiry and participant binding, and update confirmation plus append-only mission event in one transaction.
- Invalidate pending challenges on leg reassignment and record the responsible operator.

## Consequences
- The token delivery channel must be confidential and must never log token material.
- The current dual-confirmation protocol does not itself prove the physical item's condition or identity; evidence capture, offline flow, retention and jurisdictional admissibility require separate product/security decisions.
- Rate limits and abuse monitoring remain mandatory before public launch.
