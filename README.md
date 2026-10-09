# SmartPOS

Intelligent Retail Management System - Phase 0 foundation with Phase 1A authentication in progress. Modular Go monolith, React/TypeScript, independent internal FastAPI, PostgreSQL and Caddy in one monorepo.

## Quick start

Prerequisites: Docker Desktop Linux containers with Compose v2; Node.js 24 for host frontend. Go/Python run through Docker.

```powershell
Copy-Item .env.example .env
npm ci
npm run stack:up
```

Open http://localhost:8088. Compose runs **up migrations only** before API readiness. Existing volumes are preserved. Environment examples contain development-only credentials: never use them in production. URL-encode password characters in connection URLs. Ports bind loopback only.

Register at `/register`, sign in at `/login`, and view the protected `/account` page. Password reset emails go to local Mailpit at http://localhost:8025 by default; this is not a production delivery provider. Set `PUBLIC_ORIGIN` to the browser-facing gateway origin and configure SMTP before exposing the application. Phase 1A still requires end-to-end verification before release.

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
npm run verify:api
npm run verify:ai
npm run verify:integration
npm run verify:resilience
npm run stack:down
```

Host Vite at http://localhost:5173 proxies `/api` and `/health` to Go at port 8080. Container web serves a built SPA. Do not run host Vite and container web on the same port.

## Scope

- **Implemented locally, pending full verification:** database-backed registration, Argon2id passwords, server-managed sessions, login/logout, account recovery, authentication UI and protected account route.
- **Foundation:** dashboard, responsive navigation, POS/auth previews, help/error pages, real API status, Go health/readiness, typed FastAPI health, organization/branch migration, local infrastructure and tests.
- **Documented/planned:** 16 modules and 106 routes. No business CRUD, checkout, payment or forecasting. `/dashboard` is not a sales dashboard; tenant membership and RBAC remain Phase 1B.
- **Deferred:** Redis, MinIO, workers, ML, sqlc and business module packages until working use cases need them.
- Evidence and blockers: [verification](docs/development/verification.md). Configured CI is not evidence of a successful CI run.

## Structure

```text
apps/web/               React, layouts, tokens, tests
apps/api/               Go bootstrap, transport, platform
apps/ai/                FastAPI and typed health checks
packages/contracts/    OpenAPI and planned route inventory
database/migrations/   Paired foundational migrations
infra/caddy/           Same-origin gateway
tests/                 Browser and container integration checks
scripts/               Contract/documentation consistency checks
docs/                  Architecture, flows, security, operations
.github/workflows/     Checks and stack smoke tests
```

Start with [architecture](docs/architecture/overview.md), [modules](docs/architecture/modules.md), [routes](docs/architecture/routes.md), [roadmap](docs/architecture/roadmap.md) and [getting started](docs/development/getting-started.md). No deployment/commit is included.
