# RUNNER

**A peer-to-peer movement and logistics network.**

> RUNNER isn't about what you're carrying. It's about getting it there.

RUNNER coordinates missions, people, relay legs and verifiable custody from origin to destination.

## Status

Early-stage engineering. The repository contains an Expo client foundation, mission domain engine, relay candidate planner, PostgreSQL persistence foundation and initial framework-neutral mission API. It is not yet a production logistics service.

Read the [documentation lifecycle](docs/README.md), [product vision](docs/PRODUCT/VISION.md), [PRD](docs/PRODUCT/PRD.md) and [go-live gates](docs/GO-LIVE.md).

## Prerequisites

- Node.js 22.13+
- npm
- Git
- PostgreSQL only for database integration work

## Quickstart

```bash
git clone https://github.com/virtuewise/Runner.git
cd Runner
npm install
npm test
npm run typecheck
```

Use the scripts in package.json to start Expo. Native builds and device testing remain required before app release.

## Environment

Copy .env.example to .env. API dependencies are injected; identity and provider variables are placeholders, not configured services. Never commit secrets.

## Repository map

- app/ — Expo Router client
- src/domain/mission/ — domain, pricing, relay and persistence
- src/api/ — framework-neutral API handlers
- database/migrations/ — PostgreSQL schema
- tests/ — automated tests
- docs/ — product, architecture, security, quality and operations

Read CONTRIBUTING.md. Material decisions belong in docs/adr/; complex plans in docs/rfcs/.

## Limitations

No production identity provider, deployed database, dispatch workers, custody challenge issuance, payments, live GPS, geospatial stack, production routing integration, deployment pipeline or compliance certification is claimed.
