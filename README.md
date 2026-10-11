# SmartPOS

Intelligent Retail Management System - Modular Go monolith, React/TypeScript, independent internal FastAPI, PostgreSQL and Caddy. Phase0–4 and Phase5.1–5.7 COMPLETED (Local); Phase5 overall COMPLETED (Local); Phase6–7 NOT STARTED; Phase6 NOT READY; Production Ready NO. Latest local acceptance:2026-10-11. See [final Phase5 evidence](docs/development/phase57-verification.md), [Quality acceptance](docs/development/phase56-verification.md) and preserved [Loyalty acceptance](docs/development/phase55-verification.md).

## Quick start

Prerequisites: Docker Desktop Linux containers with Docker Compose; Node.js24 for host frontend. Go/Python run through Docker. Startup below automatically migrates through version12: use only for an explicitly approved new/local database. Never use the persistent primary volume as a verification target; acceptance uses isolated `smartpos-auth-test`.

```powershell
Copy-Item .env.example .env
npm ci
npm run stack:up
```

Open http://localhost:8088. Compose runs **up migrations only** before API readiness. Existing volumes are preserved. Environment examples contain development-only credentials: never use them in production. URL-encode password characters in connection URLs. Ports bind loopback only.

Register at `/register`, sign in at `/login`, and view the protected `/account` page. Password reset emails go to local Mailpit; this is not a production delivery provider. Set `PUBLIC_ORIGIN` to the browser-facing gateway origin and configure SMTP before exposing the application. Phase 1A passed the local authentication gate on 2026-10-09; this does not authorize a production release. See the verification report for the isolated test setup, Mailpit access and remaining operational limits.

Continue at `/setup` to create an organization, its Owner membership and main branch atomically, or select an existing organization. Manage organization details at `/settings/store`, branches at `/settings/branches`, staff/invitations at `/employees`, membership details at `/employees/:id`, and the fixed role matrix at `/roles`. Invitations go to Mailpit and require the invited email's authenticated account. Organization/branch selections are preferences only; every API operation rechecks membership and permissions. See [Phase 1B architecture and limitations](docs/architecture/organization.md).

Create organization-scoped units at `/units`, categories at `/categories` and brands at `/brands`, then add products with at least one saleable variant at `/products/new`. Browse/search/filter at `/products`, edit products/variants at `/products/:id/edit`, manage barcodes at `/products/:id`, import CSV/XLSX at `/products/import` and preview/print labels at `/products/labels`. Money remains exact decimal strings; stock is managed through the separate branch-scoped Inventory domain. Image storage and direct thermal printer support are not configured. See [catalog architecture, permissions and import format](docs/architecture/catalog.md).

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
npm run verify:inventory
npm run verify:pos
npm run verify:returns
npm run verify:purchasing
npm run verify:ai
npm run verify:integration
npm run verify:resilience
npm run stack:down
```

Host Vite at http://localhost:5173 proxies `/api` and `/health` to Go at port 8080. Container web serves a built SPA. Do not run host Vite and container web on the same port.

## Scope

- **Phase 1A implemented and locally verified:** database-backed registration, Argon2id passwords, server-managed sessions, login/logout, asynchronous account recovery, authentication UI, protected account route, trusted Caddy client identities and spoofing-resistant rate limits.
- **Phase 1B implemented and locally verified:** organization onboarding/switching/settings, branch management, employee membership/invitations, fixed-role RBAC, branch/tenant denial, last-owner protection and successful-change audit. Runtime connections use `smartpos_runtime`. Membership/invitation isolation is application-enforced, not blanket database RLS.
- **Phase 1C implemented and locally verified:** products/categories/brands/units, stable SKU variants and exact prices, manufacturer/alias/internal barcodes, keyboard lookup, browser-print labels, atomic CSV/XLSX preview/confirm, permission checks and catalog RLS. Catalog introduced schema version 4; current readiness requires clean version 13; nine catalog routes. Catalog regression retains 116 API assertions; historical Phase 3 evidence is linked below.
- **Phase 3 implemented and locally verified:** stock-source-bound terminals, persisted revisioned carts/holds, exact cash/manual QR/manual transfer confirmation, atomic sales/Inventory posting, durable funds reconciliation, immutable receipts/history and register shifts. Ten browser routes, 197 POS integration assertions, 64 frontend tests and 17 browser tests passed locally. See [Phase 3 report](docs/development/phase3-verification.md).
- **Foundation:** dashboard, responsive navigation, help/error pages, real API status, Go health/readiness, typed FastAPI health, organization/branch migration, local infrastructure and tests. Legacy POS/auth preview pages have been removed; use `/pos` and `/login` for the working screens.
- **Phase 4 completed (Local):** suppliers, purchase orders, receiving/returns, shelves/slots/assignments, replenishment tasks and deterministic suggestions. Fresh migrations 1–7/reruns, rollback-only SQL/RLS/grants, 300 purchasing/shelf assertions, 75 frontend tests, Go race/vet/build and 18 browser tests passed with Phase 0–3 regressions retained. See [Phase 4 final acceptance](docs/development/phase4-verification.md).
- **Phase 5.1 completed (Local):** historical full/partial returns, approvals, inspected Inventory disposition, explicit manual refund evidence/reconciliation, current-shift cash accounting and two real routes. Latest acceptance: 247 Returns API assertions, 91 frontend tests, 19 browser tests, Go race/vet/build and fresh migrations 1–8. See [business operations boundaries](docs/architecture/business-operations.md).
- **Phase 5.2 completed (Local):** `/pos/exchanges` and `/sales/voids` provide approved historical-credit exchanges, explicit net-difference settlement/recovery, atomic replacement Sales/Inventory, auditable full-sale reversals and browser acknowledgement printing. Return credit is not new external funds; original Sales and closed shifts remain immutable. 384 new API assertions, 94 frontend tests, 21 browser tests, fresh schema9 and CGO race checks passed. See [exchange flow](docs/business-flows/product-exchanges.md).
- **Phase 5.3 completed (Local):** organization/branch price lists, deterministic scheduled promotions, manual discount approvals, server-authoritative quotes, atomic redemptions, immutable historical net allocations and zero-payable NONE settlement. Five real routes use the existing UI/API stack. See [pricing architecture](docs/architecture/pricing.md) and [acceptance results](docs/development/phase53-verification.md).
- **Phase 5.4 completed (Local):** organization-shared Customer CRUD/archive, groups/memberships, masked lookup, backend-validated POS selection, immutable Sale code snapshots and authoritative paginated history. Three real routes, migration11, 253 Customer API assertions, 103 frontend tests and 25 full browser tests passed; see [Customers](docs/architecture/customers.md) and [acceptance results](docs/development/phase54-verification.md).
- **Phase5.5 completed (Local):** PostgreSQL rules/accounts, immutable points, exact committed earning/reward reservations/discounts, authorized adjustments and historical Return/Exchange/reversal compensation. Two routes, schema12,249 Loyalty API assertions,144 frontend/37 browser tests and17 zero-mismatch checks; see [Loyalty](docs/architecture/loyalty.md) and [acceptance](docs/development/phase55-verification.md).
- **Phase5.6 completed (Local):** explicit tracked/untracked stock, batch receiving/picking, FEFO/expiry/quarantine, approved write-offs and irreversible recalls. Four routes and schema13; [Quality architecture](docs/architecture/quality.md) documents operational limits.
- **Phase5.7 completed (Local):** 23 API suites/2620 numbered assertions plus Auth/Organization checks, 120 frontend tests, 37 gateway browser tests, fresh1–13/10 SQL suites, Go race, isolated resilience and32 zero-mismatch checks. See [final acceptance](docs/development/phase57-verification.md).
- **Documented/planned:** canonical16 modules/106 planned routes do not mean106 implemented pages. Valuation, split-lot picking, hardware/payment certification and Phase6–7 remain deferred.

Current verification: `node scripts/check-phase56-migrations.mjs --start` creates and retains a fresh isolated schema13 DB and points only the test stack to it. Set `AUTH_TEST_DATABASE` from `.local/phase56-database.json`; run `npm run verify:loyalty`, `npm run verify:quality`, `node tests/integration/phase57-flow.mjs` and `node scripts/check-auth.mjs --workers=2`. Never use the primary DB. Historical schema12 checkers are not current acceptance tools. See the final report for exact safe environment and resilience settings.

- **Deferred:** Redis, MinIO, workers, ML, sqlc and business module packages until working use cases need them.
- Evidence and blockers: [verification](docs/development/verification.md). Configured CI is not evidence of a successful CI run.

## Structure

```text
apps/web/               React, layouts, tokens, tests
apps/api/               Go bootstrap, transport, platform
apps/ai/                FastAPI and typed health checks
packages/contracts/    OpenAPI and planned route inventory
database/migrations/   Forward-only migrations1–12; latest adds Loyalty and reward settlement guards
infra/caddy/           Same-origin gateway
tests/                 Browser and container integration checks
scripts/               Contract/documentation consistency checks
docs/                  Architecture, flows, security, operations
.github/workflows/     Checks and stack smoke tests
```

Start with [architecture](docs/architecture/overview.md), [modules](docs/architecture/modules.md), [routes](docs/architecture/routes.md), [roadmap](docs/architecture/roadmap.md) and [getting started](docs/development/getting-started.md). No deployment/commit is included.

## Phase 2 inventory (local)

Use /inventory for real scoped overview, /inventory/locations for warehouses/sales floors/shelves and /inventory/balances for exact quantities and one-time opening stock. /inventory/adjustments requests/approves/posts delta or target corrections; /inventory/counts records physical observations and validates snapshots before posting. /inventory/transfers dispatches conserved movement pairs, with explicit transit stock and full receipt for inter-branch transfers. /inventory/movements is read-only ledger history; /inventory/reorder-points evaluates active warehouse/sales-floor/shelf stock. Count/transfer detail routes retain evidence and audit actors.

Quantity is NUMERIC(18,3), transported as decimal strings. COUNT/PACKAGING are whole units; WEIGHT/VOLUME allow three decimals. Runtime cannot directly write balances or rewrite movements. Successful stock commands require UUID Idempotency-Key plus existing Origin/CSRF; authorization is rechecked even on exact retries. Inactive branches, locations and archived catalog stock are not POS eligible. See [inventory design](docs/architecture/inventory.md), [ledger invariants](docs/database/inventory-ledger.md) and [current verification](docs/development/verification.md).

No purchase receiving, reservation, costing/valuation, partial transfer receipt or advanced shelf/AI workflow is claimed. Do not run verification against production: verify:inventory and verify:pos use only smartpos-auth-test and create isolated fixture data. Migrations 5 and 6 were applied only to isolated test databases; the original Compose volumes are untouched.

## Phase 3 POS (local)

Create an active branch-local WAREHOUSE, SALES_FLOOR or SHELF and stock its variants through Inventory. At `/pos/register/open`, an authorized Owner/Manager configures a terminal with exactly one sale source; the cashier opens a shift with counted opening cash. `/pos` supports product search/category filtering and keyboard barcode input; `/pos/held-carts` persists holds without reserving stock.

At `/pos/checkout`, prepare a frozen quote, explicitly acknowledge real received funds, then complete the sale. CASH supports received/change; QR_MANUAL and BANK_TRANSFER_MANUAL require an operator-entered reference and exact amount. They do not contact a bank or prove settlement. If posting fails after funds confirmation, the saved checkout remains RECONCILIATION_REQUIRED; retry completion or have an Owner/Manager document external funds resolution at `/pos/shifts`. Do not collect payment again merely because a response was lost.

Browse `/sales`, `/sales/:id` and `/receipts`; receipts use committed snapshots and browser print at 58/80 mm. Print failure never reverses or reposts a sale. `/pos/register/close` reconciles counted cash against opening cash plus net CASH sales minus confirmed cash refunds; manual methods are excluded. Reported/unreconciled cash refunds block closure. `/pos/register/history` and `/pos/shifts` retain branch/cashier-scoped history.

Read [POS architecture](docs/architecture/pos.md), [checkout workflow](docs/business-flows/pos-checkout.md), [database invariants](docs/database/sales-transactions.md) and the [historical Phase 3 verification report](docs/development/phase3-verification.md). Phase 4 has since passed [local acceptance](docs/development/phase4-verification.md); current Phase 5.1 and remaining gaps are recorded in the [Phase 5 report](docs/development/phase5-verification.md). Physical scanner/printer, production TLS/secrets, least-privilege login, backup/restore, retention and load gates are not verified.
