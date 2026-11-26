# ADR-0003: Framework-neutral Fetch API boundary

Status: Accepted. Date: 2026-11-26. Owner: Engineering.

## Context

Handlers should be independently testable and portable across deployment frameworks.

## Decision

Use standard Fetch Request/Response handlers with injected authentication, repository, screening, pricing and routing dependencies. Select a production adapter after hosting requirements are known.

## Alternatives

Framework-coupled handlers deferred; direct DB access in route handlers rejected.

## Consequences

Tests need no network listener; production still needs adapter, middleware, tracing, rate limits and secure headers.

## Security

Authenticator must verify signed credentials, issuer, audience and expiry; roles derive from trusted claims. No permissive fallback.

## Review triggers

Hosting platform and middleware requirements selected.