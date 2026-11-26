# Runbook: Transactional Outbox and Dead Letters

Status: Initial operator procedure; validate against the deployed worker before use.

## Symptoms
- Outbox pending count or oldest-message age rises.
- Repeated provider delivery errors.
- Messages reach `dead_lettered_at`.

## First response
1. Check publisher/provider health and credentials without exposing secrets.
2. Inspect error codes, retry counts and oldest pending age.
3. Confirm whether consumers deduplicate by the stable outbox message ID.
4. Do not bulk-reset attempts or clear dead-letter markers to hide an incident.

## Recovery
1. Restore provider connectivity or credentials through the approved secret-management process.
2. Identify affected message IDs and verify whether the downstream side effect already occurred.
3. Replay only after confirming consumer idempotency and the intended recipient/action.
4. Record operator, reason, message IDs and outcome in the incident record.
5. Watch pending age, delivery latency and duplicate suppression after recovery.

## Escalate
Escalate if message payloads may contain personal data, duplicate side effects occurred, or mission/custody state may disagree with notification state. The database mission event remains authoritative; notifications are delivery hints, not the source of truth.
