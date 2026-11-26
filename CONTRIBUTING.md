# Contributing to RUNNER

## Principles

Preserve mission, assignment, custody and audit invariants. Keep domain boundaries explicit. Fail closed on identity, screening and eligibility. Never log secrets, addresses or sensitive manifests. Record material decisions in ADRs and complex work in RFCs. Do not claim deployment without evidence.

## Workflow

1. Branch from current integration branch using feat/, fix/, docs/ or ops/ prefixes.
2. Link requirement, issue or RFC.
3. Use focused commits and Conventional Commit prefixes.
4. Update docs, tests, migration and changelog as needed.
5. Run npm test and npm run typecheck plus relevant integration tests.
6. Use draft PRs for incomplete work; mark ready only after acceptance criteria pass.

## Review checklist

- [ ] Requirements and acceptance criteria linked.
- [ ] Server-side authorization and negative paths tested.
- [ ] Idempotency, transactions and concurrency considered.
- [ ] PII and secrets protected.
- [ ] Migrations forward-compatible.
- [ ] Telemetry privacy-safe.
- [ ] Docs/runbooks updated.
- [ ] CI passes and limitations disclosed.

## Style

Follow strict TypeScript config, explicit trust-boundary types, validated input, pure domain logic and dependency injection. Avoid unbounded retries and silent fallbacks.