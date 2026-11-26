# Infrastructure & Disaster Recovery

Status: Target design only; cloud provider and topology not selected. Owner: Platform / Security.

Target: clients → edge/API → modular backend → managed PostgreSQL; external identity, routing, screening, notifications and payments behind adapters; centralized telemetry.

Use managed secrets, workload identity, private DB networking, TLS, least-privilege roles and audited admin access.

Proposed RPO 15 minutes / RTO 4 hours are not commitments until backup configuration and restore exercises prove them.

Before launch: encrypted automated backups, point-in-time recovery, isolated restore validation, quarterly recovery exercises, region/provider failure review and IaC security scans. No cloud deployment or restore exercise is currently complete.