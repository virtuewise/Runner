# CI/CD & Environments

Status: Test/typecheck workflow exists; deployment pipeline not configured. Owner: Platform Engineering.

Environments: local synthetic data; isolated CI; production-like staging with masked data; production with managed secrets, backups and monitoring.

Pipeline target: lint/format → typecheck → unit → PostgreSQL integration → contract → security scans → build → staging → smoke/E2E → approval → canary → promotion.

Use immutable commit artifacts, forward-compatible expand/contract migrations, independent app rollback where schema allows, feature flags and canary health gates. Never blindly roll back data migrations.

Current verified state is GitHub Actions test/typecheck only. No staging or production pipeline exists.