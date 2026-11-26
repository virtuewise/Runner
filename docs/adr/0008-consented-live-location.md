# ADR-0008: Purpose-limited, consented Runner location ingestion

- Status: Proposed for review
- Date: 2026-11-26

## Context

Live relay coordination needs current Runner positions, but a location feed is sensitive personal data and can become an unnecessary surveillance system if the platform retains every breadcrumb or treats a device coordinate as proof of custody.

## Decision

- Location sharing is explicitly opt-in and purpose-bound to active mission operations.
- The ingestion boundary uses the authenticated Runner principal; client-supplied Runner IDs are never authoritative.
- Validate coordinate ranges, accuracy, timestamp skew, freshness, optional heading/speed and monotonic device sequence.
- Persist only the latest snapshot, not a continuous location history, in this first slice.
- Snapshots carry an expiry and are not considered custody or delivery evidence.
- Availability windows are persisted independently from location.
- Disable/withdrawal of consent and retention cleanup must be wired into the authenticated API and worker before live rollout.

## Consequences

This limits operational history and analytics until a privacy review approves a justified retention design. Dispatcher views must display freshness and accuracy, not imply a live fix when data is expired. Location sharing remains unavailable until authentication, consent controls, cleanup scheduling and privacy notices are deployed.
