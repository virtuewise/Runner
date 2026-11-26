# Runbook: Database recovery

Template; provider-specific procedure pending.

1. Declare incident lead and pause risky writes if integrity is uncertain.
2. Confirm provider incident and recovery point.
3. Authorized operator verifies backup metadata and integrity.
4. Restore to isolated instance first; never experiment on production.
5. Validate migrations, mission/version invariants, event history and idempotency receipts.
6. Assess data loss against approved RPO and obtain approval before promotion.
7. Promote using provider-specific procedure.
8. Run authenticated smoke tests and reconcile in-flight missions/custody.
9. Record actual RPO/RTO.