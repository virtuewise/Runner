# Runbook: API unavailable

Template; deployment commands pending.

1. Confirm alert/environment and inspect health, errors and latency.
2. Check recent deploys, configuration, identity provider and database.
3. Inspect traces/logs by request ID; avoid sensitive payloads.
4. Stop rollout or deploy last known-good compatible artifact if release-related.
5. Apply fail-closed degradation; never bypass auth or screening.
6. Verify health, authenticated read, safe command and DB connectivity.
7. Notify incident lead/support; record impact and timeline.
8. Preserve evidence and complete review.