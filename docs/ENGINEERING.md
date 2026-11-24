# RUNNER engineering standard

**Status:** Baseline v0.1  
**Last reviewed:** 2026-11-24

## Supported toolchain

The initial universal client is aligned to the stable Expo SDK 58 release train.

| Component | Version / policy |
|---|---|
| Expo SDK | 58 |
| React Native | 0.88.1 |
| React | 19.3.0 |
| Expo Router | ~58.0.32 |
| TypeScript | 7.0.2 |
| Node.js | >=22.13.0 |
| Package manager | npm with committed lockfile |

Expo SDK 58 officially targets React Native 0.88, React 19.3.0 and Node.js 22.13.x minimum. Expo Router's SDK 58 recommended line is ~58.0.32. Keep Expo-managed native dependencies aligned using the Expo installer, then run expo-doctor.

Only stable releases are allowed in production. Do not use alpha, beta, canary, nightly, RC, dev, experimental or floating latest tags in production dependency manifests. Pin direct dependencies and commit the lockfile. The initial repository seed does not yet contain a generated lockfile; generate it after running the SDK-aware installation step below, then commit it before enabling release automation. Review transitive dependency changes before merging.

### First install

Use the Expo SDK-aware installer to resolve the Router native peers to the exact SDK 58-compatible versions rather than guessing their versions:

1. npm install
2. npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar react-native-web react-dom
3. npx expo install --fix
4. npx expo-doctor
5. npm run typecheck
6. Commit the generated package-lock.json and any aligned manifest changes.

## Required checks

Before a change is merged:

1. npm ci
2. npm run typecheck
3. npm run doctor
4. Unit and integration tests for changed domain behaviour.
5. Accessibility review for interactive screens.
6. Secret scan and dependency vulnerability scan.
7. Build smoke test for iOS, Android and web when native/client code changes.

A check that has not been executed must never be described as passing.

## TypeScript rules

- Strict mode is mandatory.
- Avoid any; use explicit domain types and runtime validation at trust boundaries.
- Keep domain rules pure and testable.
- Use discriminated unions for state machines and result types.
- Do not trust client-supplied prices, permissions, identity claims, location or mission status.
- Validate all external payloads at runtime before use.

## Security and privacy

- No secrets, service-role keys, signing keys or private credentials in client code.
- Environment files are ignored; publish only a safe environment example.
- Enforce authorization on the server for every object and transition.
- Apply least privilege, short-lived access tokens, rate limits and audit logging.
- Minimize personal data and location retention; document purpose and retention.
- Use private object storage and signed, short-lived URLs for proof media.
- Threat-model identity, payments, custody handoffs, account recovery and location sharing.

## Code organization

- UI components render state and dispatch intent; they do not own business policy.
- Domain modules own state transitions, eligibility and pricing rules.
- Infrastructure adapters implement typed ports; providers remain replaceable.
- Keep feature boundaries explicit: identity, profiles, missions, dispatch, custody, payments, trust & safety, notifications, business operations.
- Prefer small, composable modules over generic frameworks created before a concrete need exists.

## Release discipline

Use semantic versioning for packages and conventional commit messages. Protect the default branch, require review and CI, prohibit force pushes, and publish signed/reproducible build artifacts where supported. Record architecture changes as ADRs under docs/adr/.

## Definition of done

A feature is not complete until it has acceptance criteria, loading/empty/error states, accessibility semantics, telemetry where appropriate, authorization and abuse considerations, tests, documentation, and a rollback strategy.
