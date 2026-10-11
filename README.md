# SmartPOS

Intelligent Retail Management System for organization- and branch-scoped retail operations.

This README is the onboarding entry point for the checked-in implementation, not a production deployment guarantee. **Phase 0–4 and Phase 5.1–5.7 are recorded as completed locally; Phase 6–7 have not started. Production Ready: NO.** The later storefront pickup extension requires **schema 14**. Local acceptance reports are dated **2026-10-11 (Asia/Bangkok)**; these are historical results, not checks rerun by reading this document.

## Table of contents

- [Overview](#overview)
- [Current scope](#current-scope)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Technology stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Usage](#usage)
- [Environment variables](#environment-variables)
- [API and health checks](#api-and-health-checks)
- [Database migrations](#database-migrations)
- [Testing and quality](#testing-and-quality)
- [Development standards](#development-standards)
- [AI-agent workflow](#ai-agent-workflow)
- [Git workflow](#git-workflow)
- [Security and privacy](#security-and-privacy)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [FAQ](#faq)

## Overview

SmartPOS connects account onboarding, catalog, stock, purchasing, shelves, POS sales and business exception flows in a modular Go monolith. React provides separate management, staff and public storefront workspaces. PostgreSQL is the transactional source of truth. A separate internal FastAPI service currently provides health endpoints only; forecasting is planned, not implemented.

Continue with the owning [architecture](docs/architecture/overview.md), [business lifecycle](docs/business-flows/retail-lifecycle.md), [workspace boundaries](docs/architecture/workspaces.md) and [verification evidence](docs/development/verification.md). Older phase-specific descriptions can be stale; current code and dated evidence take precedence for current behavior.

## Current scope

### Implemented with local evidence

| Area                      | Implemented behavior                                                                                                                                                                    | References                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and organization | Registration, Argon2id passwords, server sessions, recovery emails, organizations, branches, staff invitations, fixed roles, tenant/branch authorization and audit                      | [Organization](docs/architecture/organization.md), [verification](docs/development/verification.md)                                                                                            |
| Catalog                   | Products/categories/brands/units, stable SKU variants, exact prices, barcodes, atomic CSV/XLSX preview/confirmation and browser-print labels                                            | [Catalog](docs/architecture/catalog.md)                                                                                                                                                        |
| Inventory                 | Locations, opening stock, append-only movements, balances, adjustments, counts, transfers and reorder thresholds                                                                        | [Inventory](docs/architecture/inventory.md), [ledger](docs/database/inventory-ledger.md)                                                                                                       |
| POS and sales             | Stock-source-bound terminals, cashier shifts, carts/holds, frozen quotes, cash/manual payment acknowledgment, atomic sales/stock posting, reconciliation and immutable receipts/history | [POS](docs/architecture/pos.md), [Phase 3](docs/development/phase3-verification.md)                                                                                                            |
| Purchasing and shelves    | Suppliers, purchase orders, partial receiving, supplier returns, shelf slots, replenishment tasks and deterministic suggestions                                                         | [Purchasing](docs/business-flows/purchasing.md), [Phase 4](docs/development/phase4-verification.md)                                                                                            |
| Business operations       | Returns/refunds, historical-credit exchanges, sale reversals, pricing/promotions/discount approvals, customers/groups and Loyalty earning/rewards/compensation                          | [Business operations](docs/architecture/business-operations.md), [pricing](docs/architecture/pricing.md), [customers](docs/architecture/customers.md), [Loyalty](docs/architecture/loyalty.md) |
| Batch and quality         | Tracked/untracked stock, selected lot receiving/movement/sale, FEFO, expiry/quarantine, approved write-offs and irreversible recalls                                                    | [Quality](docs/architecture/quality.md), [Phase 5.6](docs/development/phase56-verification.md)                                                                                                 |
| Storefront pickup         | Published stores/selected variants, guest orders/private tracking, staff preparation and payment at pickup through POS                                                                  | [Storefront usage](docs/architecture/storefront.md), [schema 14 evidence](docs/development/storefront-verification.md)                                                                         |
| Foundation                | Navigation, help/system status, Go/FastAPI health, local infrastructure, contracts and configured CI                                                                                    | [Modules](docs/architecture/modules.md), [routes](docs/architecture/routes.md)                                                                                                                 |

[Final Phase 5 acceptance](docs/development/phase57-verification.md) covers the integrated supplier-to-sale/return/exchange/recall lifecycle on schema 13. [Storefront acceptance](docs/development/storefront-verification.md) covers the later schema 14 extension with narrower regression coverage. Neither certifies production readiness.

### Not implemented or not certified

- No online payment, shipping, customer-shopping account or stock reservation. Pickup totals are estimates until POS revalidates price, lot and stock.
- No bank/payment-provider verification, split payments, offline settlement guarantee or certified scanner/receipt-printer integration.
- No inventory valuation/costing, split-lot allocation or partial receipt of inter-branch stock transfers. Partial purchase receiving is a separate implemented flow.
- No trained ML model, forecasting endpoint or automatic AI approval of stock, payments or purchase orders.
- Production TLS/secrets, dedicated least-privilege database login, backup/restore, load/failover, retention/erasure and full accessibility gates remain outstanding.

The contract inventory contains **17 modules and 113 logical UI routes**, including planned pages. Inventory entries and visible navigation do not prove implementation or permission.

## Architecture

```text
Browser: React / TypeScript
  | relative /api/v1 and /health requests
  v
Caddy gateway :8088
  |-- page requests ------> web :5173 (built SPA served by Caddy)
  |-- /api/*, /health/* ---> Go API :8080 (modular monolith)
  |                            +--> PostgreSQL :5432
  |                                 transactions / tenant scope / ledger / audit
  +-- /internal/* --------> 404 (not publicly proxied)

FastAPI AI :8001 (internal-only network)
  +--> live/ready health only
  Go --> AI business calls: planned for Phase 6, not wired today

Go API --> Mailpit :1025 (local SMTP / recovery and invitation messages)
Host Vite :5173 --> /api and /health proxy --> 127.0.0.1:8080 (optional)
```

Go owns public authorization, business orchestration, primary database access and transactions. The browser never calls PostgreSQL or internal AI. AI is not a Go readiness dependency. Inventory and sale posting remain atomic; receipt printing cannot reverse or repost a sale.

Compose separates `edge`, `proxy`, `data` and `intelligence` networks. Only `intelligence` currently sets `internal: true`; the `data` setting is commented out in [Compose](docker-compose.yml). The trusted proxy is one configured Caddy IP, not an arbitrary forwarded header/subnet. [Local operations](docs/deployment/local.md) records historical host-binding caveats.

## Project structure

```text
SmartPOS/
├── apps/
│   ├── web/src/
│   │   ├── app/            Router, providers, access and workspace navigation
│   │   ├── features/       Feature pages, behavior and feature tests
│   │   ├── layouts/        Management, staff and storefront shells
│   │   ├── components/     Shared controls and UI primitives
│   │   ├── lib/            API clients and helpers
│   │   ├── styles/         Runtime tokens (tokens.css) and styles
│   │   └── test/           Frontend test setup
│   ├── api/
│   │   ├── cmd/server/     Go entry point / composition root
│   │   └── internal/
│   │       ├── transport/  Public router composition
│   │       ├── modules/    Actual Go business modules
│   │       └── platform/   HTTP, config and database infrastructure
│   └── ai/
│       ├── app/            FastAPI health/config; no prediction models
│       └── tests/          Python health tests
├── packages/contracts/     OpenAPI and logical route inventory
├── database/migrations/    SQL migrations 000001–000014
├── infra/caddy/            Same-origin gateway configuration
├── tests/integration/      API/SQL fixtures and integration checks
├── tests/e2e/              Playwright browser scenarios
├── scripts/               Contract, migration and resilience checks
├── docs/                  Architecture, flows, DB, security, evidence
├── .github/workflows/      Configured CI checks
├── .agents/skills/         Canonical SmartPOS agent skills
├── .claude/skills/         Adapters to canonical skills
├── AGENTS.md               Project instructions
├── CLAUDE.md               Claude execution guidance
├── TODO.md                 Existing tracker; preserve it
├── docker-compose.yml      Local services and persistent DB volume
├── package.json            Root workspace and command entry points
└── README.md               Onboarding entry point
```

Current Go module directories are `catalog`, `customers`, `identity`, `inventory`, `loyalty`, `organization`, `pos`, `pricing`, `purchasing`, `returns` and `storefront`. Architectural domain lists do not imply matching implemented packages.

## Technology stack

Versions below come from repository manifests/image tags, not claims about latest upstream releases.

| Part           | Checked-in technology                                                                                                    | Source                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Web runtime    | Node.js `>=24 <25`, React/React DOM `19.3.0`, TypeScript `6.0.3`, Vite `8.3.4`                                           | [Root manifest](package.json), [web manifest](apps/web/package.json)                                                            |
| Web UI/state   | React Router `7.18.4`, TanStack Query `5.104.1`, Tailwind CSS `4.3.3`, Lucide `1.53.0`, local Inter/Noto Sans Thai fonts | [Web manifest](apps/web/package.json), [tokens](apps/web/src/styles/tokens.css)                                                 |
| Public API     | Go `1.26.0`, chi/v5 `5.2.3`, pgx/v5 `5.7.6`, `net/http`, structured `slog`                                               | [go.mod](apps/api/go.mod), [server](apps/api/cmd/server/main.go)                                                                |
| Internal AI    | Python `>=3.13,<3.14`, uv `0.10.0`; FastAPI `>=0.115,<1`, uvicorn `>=0.34,<1`, pydantic-settings `>=2.8,<3`              | [pyproject.toml](apps/ai/pyproject.toml), [uv.lock](apps/ai/uv.lock), [Dockerfile](apps/ai/Dockerfile)                          |
| Infrastructure | PostgreSQL `17-alpine`, Caddy `2.10-alpine`, golang-migrate `v4.18.3`, Mailpit `v1.31.4`, Docker Compose                 | [Compose](docker-compose.yml), [web Dockerfile](apps/web/Dockerfile)                                                            |
| Quality        | Vitest `5.0.3`, Testing Library, ESLint `10.12.0`, Prettier `3.9.9`, Playwright `1.64.0`, Go tests/race/vet, pytest/Ruff | Manifests, [API Dockerfile](apps/api/Dockerfile), [CI](.github/workflows/ci.yml)                                                |
| Contracts      | OpenAPI `3.1.0`, JSON route inventory and Node consistency checks                                                        | [OpenAPI](packages/contracts/openapi.yaml), [inventory](packages/contracts/routes.json), [checker](scripts/check-contracts.mjs) |

`package-lock.json`, `go.sum` and `apps/ai/uv.lock` retain dependency resolution. Container tags are version-family pins, not immutable digests. Redis, MinIO, sqlc, extra workers and ML dependencies remain deferred until real use cases require them.

## Prerequisites

- Docker Desktop Linux engine and Docker Compose v2 for Docker-first setup.
- Node.js 24/npm 11 for root/frontend commands, per [getting started](docs/development/getting-started.md). The manifest enforces the Node family, not an npm engine.
- Available loopback ports: gateway `8088`, API `8080`, web `5173`, PostgreSQL `5432`, Mailpit UI `8025`. AI `8001` is not published; Mailpit SMTP `1025` is internal by default.
- Native services only: Go 1.26, or Python 3.13 with uv 0.10.0. Docker supplies these toolchains otherwise.
- Playwright Chromium for browser checks only. Dependencies/browser installation, service startup and migrations require applicable approval; none is implied by a documentation edit.

## Setup

### Docker-first: approved new local database

Run from the repository root. **`stack:up` automatically runs all up migrations before starting the API.** Use this sequence only for an explicitly approved new/local database, not to verify an existing primary stack.

```powershell
# Optional: root .env.example lists overrides; blank values use Compose defaults.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run stack:up
```

Do not overwrite an existing `.env`; edit approved local overrides instead. No seed/reset step is required. Named database volumes persist. Changing bootstrap credentials after initialization does not rotate credentials already stored in the database.

Open **http://localhost:8088** and check [readiness](#api-and-health-checks). Mailpit UI is configured at **http://localhost:8025**; actual host access has not been reconfirmed in this documentation task. Mailpit is not a production delivery provider.

### Existing local database

Review schema, backups and migration impact before approving an upgrade. API/web from this revision require **clean schema 14**. The migration and matching API/web must roll out together; prior verification did not upgrade the persistent primary stack automatically. See [storefront rollout](docs/architecture/storefront.md) and [migrations](#database-migrations).

### Frontend auto-update through the gateway

With an already-running local stack, use Docker Compose 2.32 or newer:

```powershell
npm run stack:dev
```

Keep this terminal open and visit **http://localhost:8088**. The development
override runs Vite instead of the built SPA. Compose Watch syncs React, CSS,
public assets and the route inventory into the container; Vite updates the browser
through the gateway WebSocket. Vite config changes sync and restart the web
container. Package manifests, the lockfile and the web Dockerfile trigger a web
image rebuild. No host node_modules or environment files are synced.

These commands target only web/caddy with --no-deps: they do not start, migrate,
rebuild or restart the database, API or AI. Start the required local backend
separately through the approved setup workflow if it is not already running.

For detached services with a separate watch terminal:

```powershell
npm run stack:dev:up
npm run stack:dev:watch
```

Keep the watch command running; stopping it stops automatic source sync. Restart
it to sync changes made while it was stopped. Do not run two watchers for the
same stack. Compose Watch syncs inside Linux, so Windows file changes do not need
Vite polling by default. Custom GATEWAY_PORT values are passed to both HMR and
the development gateway CSP. The gateway permits inline React Refresh setup and
loopback WebSockets only in its development config; the original CSP is unchanged.
Development mode is local-only, not a production server. Tests are not run on save.
Run npm run test:dev-stack for the development config regression checks. Gateway
or Compose config changes require rerunning stack:dev:up and restarting watch.

To return to the built frontend, stop the watch command first, then run:

```powershell
docker compose up --build -d --wait --no-deps web caddy
```

### Optional native development

For a host frontend, stop the container web service on an approved local stack first to avoid occupying the same port:

```powershell
docker compose stop web
npm run dev
```

Vite uses `5173` with `strictPort: true` and proxies `/api` and `/health` to `127.0.0.1:8080`. Include the actual Vite origin in `DEV_ORIGINS`. For another API port, set `SMARTPOS_API_PROXY_TARGET` deliberately before starting Vite. The default gateway serves the built SPA; use the development override above for hot reload through the gateway.

For native Go, configure required shell variables from [the API example](apps/api/.env.example), including a reachable SMTP service and migrated local database, then run from the repository root:

```powershell
Set-Location apps/api
go run ./cmd/server
```

For native AI, also starting from the repository root:

```powershell
Set-Location apps/ai
uv sync --frozen
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Go/FastAPI do **not** automatically load per-service example files. Compose reads root overrides. There is no checked-in `apps/web/.env.example`, and no `VITE_*` variable is used in the inspected web source.

## Usage

### Entrances and first retail workflow

| Route                             | Purpose                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/`                               | Public storefront, management and staff entrances                                                                  |
| `/shop`, `/shop/<slug>`           | Published stores/products; no employee sidebar or organization-context requests                                    |
| `/login`, `/register`, `/account` | Team authentication and account onboarding, not customer-shopping accounts                                         |
| `/workspace`                      | Active membership: Owner/Manager to `/manage/dashboard`, operational staff to `/work`; no membership to `/account` |
| `/setup`                          | Creates organization, Owner membership and main branch atomically, or selects an organization                      |
| `/manage/...`, `/work/...`        | Management and daily-work areas; switching never grants permissions                                                |
| `/help/system`                    | Development readiness, not business reporting                                                                      |

1. Register/sign in, then create or select an organization at `/setup`.
2. As an authorized manager, use `/manage/settings/store`, `/manage/settings/branches`, `/manage/employees` and `/manage/roles`. Invitations require the invited email's authenticated account.
3. Create units/categories/brands and products at `/manage/units`, `/manage/categories`, `/manage/brands` and `/manage/products/new`. Import or print labels through `/manage/products/import` and `/manage/products/labels`.
4. Create a branch-local saleable `WAREHOUSE`, `SALES_FLOOR` or `SHELF` and establish stock through Inventory. Configure a terminal and open a cashier shift at `/manage/pos/register/open` or `/work/pos/register/open` with appropriate permissions.
5. Use `/manage/pos` or `/work/pos` for search/barcodes/cart. Holds do not reserve stock. Prepare a quote, explicitly acknowledge received funds and complete checkout. Review sales/receipts and reconcile counted cash before shift closure.
6. Publish a store and selected variants at `/manage/settings/storefront`. Staff handles `/manage/online-orders` or `/work/online-orders`; customer arrival opens the order in the cashier's POS. Only successful settlement completes it.

Legacy `/dashboard`, `/staff` and unprefixed business bookmarks redirect to canonical workspace routes while retaining IDs, query parameters and fragments. API paths remain unchanged. Administrative pages require management roles and permissions; operational pages retain existing permission checks. An owner choosing `/work` stays in that area for shared operational navigation.

### POS settlement and recovery

- `CASH` supports received cash/change. `QR_MANUAL` and `BANK_TRANSFER_MANUAL` require an operator reference and exact amount; they do not contact a bank or prove settlement.
- A checkout that fails after funds acknowledgment remains `RECONCILIATION_REQUIRED`. Retry completion or have an authorized Owner/Manager document external funds resolution; never collect payment again just because a response was lost.
- Register close compares counted cash with opening cash plus net cash sales minus confirmed cash refunds; manual methods are excluded. Reported/unreconciled cash refunds block closure.
- Receipts use committed snapshots and browser printing at 58/80 mm. Print failure cannot reverse/repost a sale. Physical scanner/printer certification and direct thermal-printer integration are not claimed.

### Root scripts

| Command                             | Actual behavior / caution                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                       | Host Vite frontend; requires an available API                                     |
| `npm run stack:up`                  | `docker compose up --build -d --wait`; starts services and automatically migrates |
| `npm run stack:logs`                | Reads last 100 Compose log lines; sanitize before sharing                         |
| `npm run stack:down`                | Removes project containers/networks, preserves named data volume; not a reset     |
| `npm run migrate`                   | Runs migration service; writes schema, requires approved target                   |
| `npm run build`                     | TypeScript build and Vite bundle for `@smartpos/web`                              |
| `npm run lint`, `npm run typecheck` | Frontend ESLint and TypeScript                                                    |
| `npm test`                          | Frontend Vitest followed by `contracts:check`                                     |
| `npm run contracts:check`           | OpenAPI, module/route documentation and contract consistency                      |
| `npm run format:check`              | Repository-wide formatting check; use scoped check for README-only edits          |
| `npm run format`                    | Repository-wide formatting write; not for a small scoped edit                     |
| `npm run e2e`                       | Playwright against an already running gateway; auth cases need fixtures           |

See [Testing and quality](#testing-and-quality) for backend/integration scripts. The root npm workspace contains `apps/web` only; `npm run build` does not build Go/Python.

## Environment variables

Use [root `.env.example`](.env.example) for Compose, [API `.env.example`](apps/api/.env.example) for native Go and [AI `.env.example`](apps/ai/.env.example) for Python. These are safe local examples/configured defaults, **not production secrets**. Password placeholders must be replaced locally, not committed, and URL-encoded in connection URLs.

### Compose and application configuration

| Variable                     | Purpose                                                             | Safe local example / default                                                                   |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `APP_ENV`                    | Go mode: `development` or `production`                              | `development`                                                                                  |
| `PUBLIC_ORIGIN`              | Exact browser origin and email-link origin                          | `http://localhost:8088`                                                                        |
| `DEV_ORIGINS`                | Comma-separated loopback HTTP origins, development only             | `http://localhost:5173`                                                                        |
| `WEB_PORT`                   | Built web host port                                                 | `5173`                                                                                         |
| `API_PORT`                   | Go host port                                                        | `8080`                                                                                         |
| `GATEWAY_PORT`               | Gateway host port                                                   | `8088`                                                                                         |
| `POSTGRES_PORT`              | Database host port                                                  | `5432`                                                                                         |
| `MAILPIT_PORT`               | Mailpit UI host port, not SMTP                                      | `8025`                                                                                         |
| `POSTGRES_DB`                | Fresh-volume database name / migration target                       | `smartpos`                                                                                     |
| `POSTGRES_USER`              | Local database bootstrap identity                                   | `smartpos_dev`                                                                                 |
| `POSTGRES_PASSWORD`          | Bootstrap password; Compose has an insecure development fallback    | `<local-password>` (placeholder)                                                               |
| `PROXY_SUBNET`               | Dedicated proxy subnet; avoid overlap                               | `172.30.42.0/28`                                                                               |
| `CADDY_PROXY_IP`             | Caddy peer / trusted-proxy source                                   | `172.30.42.2`                                                                                  |
| `API_PROXY_IP`               | Go address in the same subnet                                       | `172.30.42.3`                                                                                  |
| `AUTH_SESSION_HOURS`         | Session lifetime; validated range `1`–`720`                         | `24`                                                                                           |
| `SMTP_ADDR`                  | SMTP host:port reachable by Go                                      | Compose `mailpit:1025`; native: approved reachable listener                                    |
| `MAIL_FROM`                  | Sender address, required by Go                                      | `noreply@localhost`                                                                            |
| `SMTP_USER`, `SMTP_PASSWORD` | Supported by Compose/config, absent from root example               | Empty for local Mailpit; required in production                                                |
| `API_ADDR`                   | Go listen address                                                   | Compose fixes `:8080`; native default `127.0.0.1:8080`                                         |
| `DATABASE_URL`               | Required native Go DB URL; derived by Compose                       | `postgres://smartpos_dev:<url-encoded-local-password>@127.0.0.1:5432/smartpos?sslmode=disable` |
| `AUTH_TRUSTED_PROXY_IP`      | Exact trusted non-loopback peer; omit for direct native development | Compose derives it from `CADDY_PROXY_IP`                                                       |
| `AI_SERVICE_NAME`            | FastAPI health service name (`AI_` prefix)                          | `smartpos-ai`; not passed by Compose today                                                     |

Changing `GATEWAY_PORT` requires matching `PUBLIC_ORIGIN`. Change subnet and both fixed IPs together. Root overrides named `API_ADDR`, `DATABASE_URL` or `AUTH_TRUSTED_PROXY_IP` do not replace the fixed/derived Compose values. Production validation requires HTTPS origin, authenticated SMTP and trusted proxy; passing validation does not make this stack production-ready.

### Verification configuration

| Variable                             | Purpose / constraint                                        | Safe example                                                      |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `E2E_BASE_URL`                       | Playwright target; default `http://127.0.0.1:8088`          | Isolated: `http://localhost:18088`                                |
| `AUTH_E2E`                           | Enables auth-dependent browser scenarios                    | `1`, with prepared isolated fixtures                              |
| `AUTH_TEST_DATABASE`                 | Retained isolated fixture DB; naming guards differ by suite | Confirmed isolated DB name, not an invented value passed to tests |
| `AUTH_TEST_PROJECT`, `AUTH_TEST_URL` | Fixtures reject other projects/origins                      | `smartpos-auth-test`, `http://localhost:18088`                    |
| `AUTH_TEST_PROXY`                    | Optional auth-harness browser proxy                         | Harness-provided address; do not invent one                       |
| `RESILIENCE_COMPOSE_PROJECT`         | Required isolated outage target                             | `smartpos-auth-test`; schema-13-specific guards also apply        |

## API and health checks

The canonical public contract is [OpenAPI](packages/contracts/openapi.yaml). Actual route composition is in [the Go router](apps/api/internal/transport/router.go) and module handlers. [routes.json](packages/contracts/routes.json) inventories logical UI routes, not all live HTTP endpoints.

| Endpoint                                            | Behavior                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /health/live`                                  | Process liveness: `{"status":"ok"}`; independent of database availability                   |
| `GET /health/ready`                                 | DB ping and exact clean schema **14**; `{"status":"ready"}` or `503 DEPENDENCY_UNAVAILABLE` |
| `GET /api/v1/system`                                | Metadata in `data`; legacy `phase: 0` field is not delivery status                          |
| Internal AI `GET /health/live`, `GET /health/ready` | Typed `status`/`service`; no external readiness dependency today                            |

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8088/health/live
Invoke-RestMethod http://localhost:8088/health/ready
Invoke-RestMethod http://localhost:8088/api/v1/system
docker compose exec ai /app/.venv/bin/python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8001/health/ready', timeout=2).read().decode())"
```

Adjust host URLs for approved custom ports. AI has no published Compose port and disables docs/OpenAPI HTTP endpoints; Caddy rejects `/internal/*`.

Public APIs use `/api/v1`, success `data` envelopes (health is separate), errors with `code`, `message`, `request_id`, and generated `X-Request-ID`. Authenticated writes require allowed Origin/CSRF; critical commands additionally require documented UUID `Idempotency-Key`. Money/quantities use exact decimal strings in current business contracts. Consult OpenAPI for each endpoint's actual pagination/status/validation; [API conventions](docs/api/conventions.md) contains historical foundation statements that no longer describe the whole system.

## Database migrations

[Go readiness](apps/api/internal/platform/database/database.go) requires `schema_migrations.version = 14` and `dirty = false`. The service uses `migrate/migrate:v4.18.3` and runs **up** from [database/migrations](database/migrations).

| Version | Up migration                        |
| ------- | ----------------------------------- |
| 1       | `000001_foundation.up.sql`          |
| 2       | `000002_identity.up.sql`            |
| 3       | `000003_organization.up.sql`        |
| 4       | `000004_catalog.up.sql`             |
| 5       | `000005_inventory.up.sql`           |
| 6       | `000006_pos_sales.up.sql`           |
| 7       | `000007_purchasing_shelves.up.sql`  |
| 8       | `000008_business_operations.up.sql` |
| 9       | `000009_exchanges_voids.up.sql`     |
| 10      | `000010_pricing_promotions.up.sql`  |
| 11      | `000011_customers.up.sql`           |
| 12      | `000012_loyalty.up.sql`             |
| 13      | `000013_batch_quality.up.sql`       |
| 14      | `000014_storefront.up.sql`          |

For an approved local target only, from the root:

```powershell
npm run migrate
```

Startup also runs migrations. Up with no pending migration is a no-op; never rewrite applied migrations. Coordinate sequential versions, review schema/contracts and preserve data. Foundation has a down file, but policy is forward-only operation; no down/drop/volume-removal/reset procedure is authorized here. Persistent-primary upgrades require backups and explicit rollout approval.

Runtime connections execute `SET ROLE smartpos_runtime`; this is not a dedicated least-privilege production LOGIN. Preserve tenant FKs, RLS where implemented, application authorization and audit. Membership/invitation isolation is application-enforced, not blanket RLS. See [database overview](docs/database/overview.md), [ledger policy](docs/database/inventory-ledger.md) and [sales invariants](docs/database/sales-transactions.md); older schema numbers are historical.

## Testing and quality

### Web, contracts and documentation

From the root with dependencies already installed:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run contracts:check
npm exec -- prettier --check README.md
```

`npm test` already includes contracts. The last command scopes formatting to README; do not use repository-wide auto-fix for a small edit. Documentation-only changes need links/anchors, reference consistency, scoped formatting and diff checks, not artificial application tests.

### Go and Python

Container targets build check images and run configured checks:

```powershell
npm run verify:api
npm run verify:ai
```

- Go: `gofmt` cleanliness, `go vet ./...`, `go test -race ./...`, `go build ./cmd/server`; race target includes a C toolchain.
- Python: Ruff lint/format check, pytest and import validation.

Native equivalents run in their service directories with required toolchains/dependencies. These container builds may download images/modules; obtain applicable approval first.

### Integration and browser checks

**Use only a confirmed isolated database/Compose project.** Domain suites create retained synthetic data, not just rollback-only SQL. Auth scenarios temporarily stop isolated Mailpit; resilience stops isolated services. Do not overlap outage suites, target the primary volume or bypass guards.

| Existing command                                                                                         | Coverage / target notes                                                                |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run verify:integration`                                                                             | Compose foundation SQL/service/gateway smoke, not full domain acceptance               |
| `npm run verify:auth`                                                                                    | Auth API flow then auth-enabled Playwright harness                                     |
| `npm run verify:organization`, `npm run verify:catalog`, `npm run verify:inventory`                      | Scoped onboarding/RBAC, catalog and Inventory                                          |
| `npm run verify:pos`, `npm run verify:returns`, `npm run verify:adjustments`                             | POS flow/safety; Returns flow/safety/shelves; exchange/reversal flow/safety/boundaries |
| `npm run verify:pricing`, `npm run verify:customers`, `npm run verify:loyalty`, `npm run verify:quality` | Feature flow/safety; inspect each database-name guard                                  |
| `npm run verify:purchasing`, `npm run verify:shelves`                                                    | Both run the same purchasing flow/safety files                                         |
| `npm run verify:phase52`, `npm run verify:phase53`, `npm run verify:phase54`                             | Historical subphase checkers, not schema-14 setup instructions                         |
| `node tests/integration/phase57-flow.mjs`                                                                | Final Phase 5 lifecycle; inspect schema-specific fixtures first                        |
| `node tests/integration/storefront-flow.mjs`                                                             | Schema-14 storefront integration; no dedicated npm alias                               |
| `npm run e2e`                                                                                            | Playwright; no automatic server startup                                                |
| `npm run verify:resilience`                                                                              | Guarded isolated outage/shutdown check, not disaster-recovery certification            |

| Service    | Default development port | Recorded `smartpos-auth-test` port |
| ---------- | ------------------------ | ---------------------------------- |
| Gateway    | `8088`                   | `18088`                            |
| API        | `8080`                   | `18080`                            |
| Web        | `5173`                   | `15173`                            |
| PostgreSQL | `5432`                   | `15432`                            |
| Mailpit UI | `8025`                   | `18025`                            |

Before a mutating suite, verify project, migrated schema, `AUTH_TEST_DATABASE`, ports, unused proxy subnet and fixture requirements. [Auth setup](docs/development/getting-started.md) and [storefront instructions](docs/architecture/storefront.md) provide context, not blanket approval to start/upgrade a stack.

Current tooling caveats:

- `scripts/check-phase56-migrations.mjs --start` creates **schema 13** and repoints the isolated stack. It is not current schema-14 acceptance setup.
- `scripts/check-resilience.mjs` requires `smartpos-auth-test`, a Phase 5.6-style isolated DB name, matching Compose `POSTGRES_DB` and gateway `http://127.0.0.1:18088`. Its recorded schema-13 workflow has not been revalidated for schema 14.
- Storefront browser tests require `AUTH_E2E=1`, `E2E_BASE_URL=http://localhost:18088` and a dedicated DB-name guard. Generic E2E can skip auth-dependent cases; a pass does not prove their execution.
- [CI](.github/workflows/ci.yml) invokes default stack/resilience commands, while the resilience script requires explicit isolated configuration. Current remote CI success is unconfirmed; YAML is not execution evidence.

The storefront report explicitly records Quality-suite target-guard blocking and no rerun of Go race/full legacy browser/load/production checks. Do not combine historical assertion counts into a claim about today's schema.

## Development standards

- Preserve modular-monolith ownership; extend actual use cases, not speculative folders/services. Do not import unrelated project rules.
- Keep authorization and tenant/branch scope in Go. Frontend permission checks and selections are presentation/preferences, not security grants.
- Preserve exact arithmetic/transport: catalog amounts `NUMERIC(18,2)`, stock quantities `NUMERIC(18,3)`, decimal strings. COUNT/PACKAGING are whole units; WEIGHT/VOLUME allow three decimals.
- Preserve transaction context, idempotency, immutable sales/receipts/movements and audit. Runtime must not directly rewrite balances/ledger. Read owning domain invariants before changing posting.
- Keep [OpenAPI](packages/contracts/openapi.yaml), Go producers, React consumers and tests consistent; distinguish planned inventory from live routes.
- Reuse React Router/TanStack Query patterns, local fonts, Lucide and canonical [CSS tokens](apps/web/src/styles/tokens.css). Follow [design guidance](docs/design-system/golden-amber.md).
- Follow [.editorconfig](.editorconfig) and [.prettierrc.json](.prettierrc.json): UTF-8/LF, two-space default indentation, tabs for Go, four spaces for Python. Scope formatting to changed files.
- Use focused regression tests at existing seams; never delete, skip, weaken or bypass tests to obtain a pass. Report unrelated defects without automatically fixing them.

## AI-agent workflow

[AGENTS.md](AGENTS.md) governs scope, safety, architecture and ownership. [CLAUDE.md](CLAUDE.md) describes Claude execution, not another business policy. Canonical workflows live in [.agents/skills](.agents/skills); [.claude/skills](.claude/skills) adapters refer to them.

1. Classify intent: inspect/explain/review/show-flow is read-only; implementation needs authorized scope.
2. Read applicable instructions and inspect actual code, Git status and existing diff; preserve user changes and `TODO.md`.
3. Select the smallest relevant skills and observable acceptance. Resolve material ambiguity before edits; never fabricate unconfirmed facts.
4. Keep one Main agent unless Workers/Reviewers are explicitly authorized. Skill selection grants neither delegation nor expanded permission.
5. Make the smallest scoped change; no installation, migration, deployment, agent-config change or Git writes without applicable authorization.
6. Report paths, actual checks, findings and limits in Thai unless another language is requested. Distinguish passed, failed, blocked and not run; local completion is not release authorization.

## Git workflow

The recorded [five-developer workflow](docs/development/git-workflow.md) specifies:

- `main` for stable releases, `develop` for integrated work.
- Feature/fix/docs branches from `develop`; small PRs into `develop`, peer review and affected checks; release PR into `main`.
- Suggested names: `feature/catalog-barcode`, `fix/inventory-transfer-locking`, `docs/api-conventions`. Use Conventional Commits and real issue references only.
- PRs include scope, contract/schema impact, evidence and rollback considerations. Shared contracts require producer/consumer review; coordinate migrations and do not rewrite applied versions.
- Never commit secrets/generated artifacts, weaken tests or force-push protected history. Agent branch/commit/push actions require explicit authorization.

These are documented conventions; actual remote protections and release automation have not been verified here. This README introduces no new Git policy.

## Security and privacy

- Keep `.env`, credentials, session/CSRF/reset/tracking tokens and customer PII out of source control, logs, examples and shared evidence. Never read real credentials to populate onboarding examples.
- Preserve HttpOnly/SameSite sessions, Origin/CSRF, rate limits, active membership/branch authorization and tenant-safe references. Recheck current authorization on idempotent retries.
- Customer permissions govern masking/notes/history. Marketing needs explicit opt-in; archival is not legally certified erasure. See [security model](docs/security/security-model.md).
- Storefront tracking uses a private random token; storage retains its hash, public responses omit contact/name/notes. Do not share tracking links. Estimates neither reserve stock nor prove payment.
- Compose publishes loopback-only ports; local Caddy disables automatic HTTPS. Do not expose this as production by changing bind addresses or credentials alone.
- Manual QR/transfer/refund confirmation is operator evidence, not a bank callback. Recover saved checkout/reconciliation state after a lost response; **do not collect funds again merely because a response was lost**.
- Traces/screenshots can contain synthetic authentication/customer data. Sanitize sharing; test artifacts are not automatically safe to publish.
- Production needs separately approved TLS/secrets, least-privilege login, backup/restore, retention, monitoring and procedures. Scoped local security evidence is not an independent audit or certification.

## Known limitations

| Limitation or discrepancy                                        | Consequence / evidence                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Older docs reference schemas 3/5/13 or foundation-only endpoints | Readiness now requires **14**; check code/OpenAPI and dated evidence                                                                           |
| Schema-13 checkers versus schema-14 storefront                   | No universal current full-regression setup is confirmed; do not repoint current API to schema 13 as a shortcut                                 |
| CI definition versus isolated resilience guard                   | Current successful remote integration run is unconfirmed                                                                                       |
| Mailpit/database host bindings                                   | Compose advertises loopback ports; older local-operation evidence reports issues. Present host access is unconfirmed                           |
| Batch picking/counting                                           | One batch per variant line, no split allocation; COUNT/CORRECTION blocked with positive tracked balances                                       |
| Physical Quality assurance                                       | FEFO is guidance; write-off checkbox is UI operator acknowledgment, not server-certified physical verification. Recall has no release workflow |
| Unknown expiry/untracked legacy                                  | No invented provenance/freshness guarantee; production policy remains unresolved                                                               |
| Payment/hardware/tax                                             | No provider verification, split payments, certified statutory tax/hardware or offline settlement guarantee                                     |
| Catalog images                                                   | Image upload/storage is not configured; adding object storage remains a separately scoped use case                                             |
| Production operations                                            | Serialization favors correctness, not proven throughput; load/failover, backup/restore, retention and full accessibility remain unverified     |

No application/database/browser/hardware/deployment checks are implied by this README update. See [Phase 5.7 boundaries](docs/development/phase57-verification.md) and [storefront failed/blocked attempts](docs/development/storefront-verification.md) for exact evidence.

## Roadmap

Only the existing [incremental roadmap](docs/architecture/roadmap.md) is summarized; no dates or new commitments are introduced.

| Phase                    | Recorded status                           | Direction                                                                                                                    |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0–4                      | Completed locally                         | Foundation, identity/catalog, Inventory, POS, purchasing/shelves; production gates separate                                  |
| 5.1–5.7                  | Completed locally                         | Business exceptions, pricing, customers/Loyalty, Quality and final integration; schema-13 acceptance                         |
| Storefront extension     | Implemented with local schema-14 evidence | Pickup/pay-at-store only; not Phase 6 or production certification                                                            |
| 6 — AI Intelligence      | Not started; not ready                    | Bounded typed Go-to-AI snapshots, advisory/versioned forecasts, provenance/insufficient-data handling and outage isolation   |
| 7 — Production Readiness | Not started                               | Hardening, load/accessibility, backup AND restore drills, monitoring, durable jobs/outbox, integrations and release/runbooks |

Future AI recommends actions, never autonomously approves purchases, settles payments or mutates stock. Phase 6/7 and production release each need separately authorized scope and evidence.

## FAQ

### Where should a new developer start?

Read [Setup](#setup), [Current scope](#current-scope) and [Architecture](#architecture), then owning docs/code. `AGENTS.md` supplies working agreements, not proof of implemented features.

### Why does readiness fail after updating the API?

Go accepts only clean schema 14. Missing, dirty or other versions return 503; DB availability is also checked. Inspect the approved target/logs, not volume deletion, forced schema state or old schema-13 setup against the primary stack.

### Why are there no products at `/shop`?

Only published stores and explicitly selected active variants appear. Migration 14 and matching API/web, active terminal/sale source and eligible THB-priced stock are needed. Empty state is real, not a sample catalog. Follow [storefront setup](docs/architecture/storefront.md).

### Does pickup reserve stock or take online payment?

No. Staff prepares an unpaid guest order; the cashier revalidates it in POS at pickup and acknowledges actual funds. Only settlement marks it `COMPLETED` / `PAID_AT_STORE`.

### Why does a documented route not work?

The 17-module/113-route inventory includes plans. Router registration, roles/permissions and implementation determine availability. Legacy URLs redirect to `/manage/...` or `/work/...`; selecting a workspace grants no new permission.

### Why can Vite fail or authenticated writes be rejected?

Container web and Vite both use 5173; stop the approved local web container first. Check `DEV_ORIGINS`, actual origin and Vite proxy target. Never disable Origin/CSRF validation to repair configuration.

### Do environment examples configure native services automatically?

No. Compose reads root overrides; Go/FastAPI need shell variables or an approved loader. Native Go's example SMTP address needs a reachable listener; Compose does not publish SMTP 1025 to the host by default.

### Are `stack:up` and `verify:*` harmless diagnostics?

No. Startup migrates, domain suites retain fixtures, and auth/resilience can stop isolated services. Confirm isolated targets and approval first. Health checks demonstrate process/schema readiness, not full business acceptance.

### Is AI required to sell, and is this production-ready?

AI has health only and is not a Go readiness dependency. Local acceptance is not production readiness; consult the reports and separately authorize the remaining production gates.
