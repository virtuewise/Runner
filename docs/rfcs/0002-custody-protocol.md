# RFC-0002: Verifiable Custody Handover

Status: Proposed. Owner: Trust / Backend.

## Problem

A custody row alone does not prove transfer. Need freshness, authenticated consent, replay resistance and dispute evidence.

## Proposal

Issue a cryptographically random single-use challenge bound to mission, leg, sender, receiver, purpose and expiry. Both parties authenticate and confirm. Persist challenge hash and lifecycle timestamps; never store reusable plaintext. Consume atomically and idempotently.

## Security

Rate-limit attempts, prevent enumeration, invalidate on reassignment/cancellation, reject expired/replayed tokens, avoid logging secrets, provide audited manual fallback.

## Open decisions

QR vs short code vs deep link; offline handover; photo/signature evidence; identity assurance; retention and jurisdictional admissibility.

## Verification

Concurrent replay, wrong-party, expired challenge, offline recovery, dispute and privacy tests.