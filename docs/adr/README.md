# Architecture Decision Records

Accepted decisions are historical; supersede rather than rewrite.

- ADR-0001: Modular monolith and domain-first boundaries.
- ADR-0002: PostgreSQL transactional source of truth.
- ADR-0003: Framework-neutral Fetch API boundary.
- ADR-0004: Transactional dispatch offers and outbox.
- ADR-0005: Two-party verifiable custody challenges.
- ADR-0006: PostgreSQL execution locks and transactional outbox.
- ADR-0007: Persistent custody challenges and production cryptography.

Use TEMPLATE.md. Number sequentially and record status, date, owners, context, decision, alternatives, consequences, security and operational impact, review triggers.
- [ADR-0008: Purpose-limited, consented Runner location ingestion](0008-consented-live-location.md)
- [ADR-0009: Authenticated operational read models and Fetch API handlers](0009-operations-read-models-and-api-boundary.md)
- [ADR-0010: Audited incident management and safety holds](0010-incident-management-and-safety-holds.md)
