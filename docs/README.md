# RUNNER Documentation

Documentation is part of the engineering system. Each artifact must state status, owner, review date, evidence and related implementation. Never describe a proposal as deployed or verified.

## Lifecycle

| Phase | Required artifacts | Exit evidence |
|---|---|---|
| Discovery | Vision, personas, competitive research, PRD, KPIs, UX research | Validated problem and measurable outcomes |
| Architecture | C4 views, ADRs, data model, API contracts, threat model | Reviewed boundaries and recorded decisions |
| Implementation | RFCs, code, tests, developer docs, migrations | CI green and review approved |
| Verification | Test plan, integration/E2E, performance, UAT | Acceptance criteria and defects dispositioned |
| Operations | CI/CD, IaC, observability, runbooks, DR | Operational readiness and rollback evidence |
| Release | Changelog, user guides, API portal, go-live checklist | Named sign-offs and monitored rollout |

## Status vocabulary

Proposed · Accepted · In progress · Implemented · Verified · Operational · Deprecated. Implemented does not mean deployed; verified must name environment and evidence.

## Index

- Product: PRODUCT/VISION.md, PRODUCT/PRD.md, PRODUCT/COMPETITIVE-RESEARCH.md, PRODUCT/METRICS-TELEMETRY.md, PRODUCT/UX-ACCESSIBILITY.md
- Architecture: ARCHITECTURE.md, adr/, DATA-MODEL.md, API-CONTRACT.md, SECURITY-PRIVACY.md
- Quality: QUALITY/TEST-STRATEGY.md, QUALITY/PERFORMANCE.md, QUALITY/UAT.md
- Operations: OPERATIONS/CI-CD.md, OPERATIONS/INFRASTRUCTURE-DR.md, OPERATIONS/OBSERVABILITY.md, runbooks/
- Delivery: RELEASE.md, GO-LIVE.md, rfcs/, ../CONTRIBUTING.md, ../CHANGELOG.md, ../.env.example

## Current baseline

Expo client foundation, mission domain engine, relay candidate planner, PostgreSQL persistence foundation and initial framework-neutral mission API. No production backend deployment is claimed.