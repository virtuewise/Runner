# Runbook: Dispatch queue stalled

Planned; live dispatch queue not implemented.

1. Confirm queue-age alert and affected zones.
2. Check worker health, DB connectivity, lock waits and candidate latency.
3. Classify policy blocks versus worker backlog.
4. Never bypass eligibility, screening, jurisdiction or time-window checks.
5. Restart/scale only after validating idempotency and in-flight claims.
6. Reconcile legs and audit events before replay.
7. Verify queue age falls and no duplicate assignments occurred.
8. Record root cause and update capacity model.