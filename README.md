# SmartPOS

Intelligent Retail Management System - Phase 0 foundation, Phase 1A authentication, Phase 1B organization/branch/employee authorization and Phase 1C product catalog locally verified. Modular Go monolith, React/TypeScript, independent internal FastAPI, PostgreSQL and Caddy in one monorepo. Phase 2 inventory is not started; this is not a production release.

## Quick start

Prerequisites: Docker Desktop Linux containers with Compose v2; Node.js 24 for host frontend. Go/Python run through Docker.

```powershell
Copy-Item .env.example .env
npm ci
npm run stack:up
```

Open http://localhost:8088. Compose runs **up migrations only** before API readiness. Existing volumes are preserved. Environment examples contain development-only credentials: never use them in production. URL-encode password characters in connection URLs. Ports bind loopback only.

Register at `/register`, sign in at `/login`, and view the protected `/account` page. Password reset emails go to local Mailpit; this is not a production delivery provider. Set `PUBLIC_ORIGIN` to the browser-facing gateway origin and configure SMTP before exposing the application. Phase 1A passed the local authentication gate on 2026-10-09; this does not authorize a production release. See the verification report for the isolated test setup, Mailpit access and remaining operational limits.

Continue at `/setup` to create an organization, its Owner membership and main branch atomically, or select an existing organization. Manage organization details at `/settings/store`, branches at `/settings/branches`, staff/invitations at `/employees`, membership details at `/employees/:id`, and the fixed role matrix at `/roles`. Invitations go to Mailpit and require the invited email's authenticated account. Organization/branch selections are preferences only; every API operation rechecks membership and permissions. See [Phase 1B architecture and limitations](docs/architecture/organization.md).

Create organization-scoped units at `/units`, categories at `/categories` and brands at `/brands`, then add products with at least one saleable variant at `/products/new`. Browse/search/filter at `/products`, edit products/variants at `/products/:id/edit`, manage barcodes at `/products/:id`, import CSV/XLSX at `/products/import` and preview/print labels at `/products/labels`. Money remains exact decimal strings; stock is not implemented. Image storage and direct thermal printer support are not configured. See [catalog architecture, permissions and import format](docs/architecture/catalog.md).

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
npm run verify:api
npm run verify:auth
npm run verify:organization
npm run verify:catalog
npm run verify:ai
npm run verify:integration
npm run verify:resilience
npm run stack:down
```

Host Vite at http://localhost:5173 proxies `/api` and `/health` to Go at port 8080. Container web serves a built SPA. Do not run host Vite and container web on the same port.

## Scope

- **Phase 1A implemented and locally verified:** database-backed registration, Argon2id passwords, server-managed sessions, login/logout, asynchronous account recovery, authentication UI, protected account route, trusted Caddy client identities and spoofing-resistant rate limits.
- **Phase 1B implemented and locally verified:** organization onboarding/switching/settings, branch management, employee membership/invitations, fixed-role RBAC, branch/tenant denial, last-owner protection and successful-change audit. Runtime connections use `smartpos_runtime`. Membership/invitation isolation is application-enforced, not blanket database RLS.
- **Phase 1C implemented and locally verified:** products/categories/brands/units, stable SKU variants and exact prices, manufacturer/alias/internal barcodes, keyboard lookup, browser-print labels, atomic CSV/XLSX preview/confirm, permission checks and catalog RLS. Required schema version 4; nine catalog routes. All 15 browser tests, 51 frontend tests and 116 catalog API assertions passed on 2026-10-09, including prior auth/organization regression.
- **Foundation:** dashboard, responsive navigation, POS/auth previews, help/error pages, real API status, Go health/readiness, typed FastAPI health, organization/branch migration, local infrastructure and tests.
- **Documented/planned:** 16 modules and 106 routes. Organization/branch/member/catalog operations work; checkout, payment, inventory and forecasting remain planned. `/dashboard` is not a sales dashboard.
- **Deferred:** Redis, MinIO, workers, ML, sqlc and business module packages until working use cases need them.
- Evidence and blockers: [verification](docs/development/verification.md). Configured CI is not evidence of a successful CI run.

## Structure

```text
apps/web/               React, layouts, tokens, tests
apps/api/               Go bootstrap, transport, platform
apps/ai/                FastAPI and typed health checks
packages/contracts/    OpenAPI and planned route inventory
database/migrations/   Foundation plus forward-only identity/organization migrations
infra/caddy/           Same-origin gateway
tests/                 Browser and container integration checks
scripts/               Contract/documentation consistency checks
docs/                  Architecture, flows, security, operations
.github/workflows/     Checks and stack smoke tests
```

Start with [architecture](docs/architecture/overview.md), [modules](docs/architecture/modules.md), [routes](docs/architecture/routes.md), [roadmap](docs/architecture/roadmap.md) and [getting started](docs/development/getting-started.md). No deployment/commit is included.
