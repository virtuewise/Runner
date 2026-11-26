# RUNNER Developer Portal

Status: Internal documentation foundation; no public developer portal or SDK is published.

## API

- [OpenAPI 3.1 contract](../openapi.yaml)
- [API contract and implementation status](../API-CONTRACT.md)
- Authentication: deployment-specific verifier is not yet configured.
- Idempotency: required on mission create/quote/publish commands.
- Concurrency: If-Match carries expected mission version on quote/publish.

## Planned portal content

Quickstart, sandbox credentials, authentication guide, API reference, webhooks/events, rate limits, idempotency, error catalogue, SDKs, versioning and migration policy.

Do not issue production credentials or publish an SDK until provider integrations, rate limits, support and security review are complete.