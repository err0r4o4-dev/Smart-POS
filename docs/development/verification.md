# Verification

## Phase 4 continuation (2026-10-10 Asia/Bangkok)

**Phase 4: IMPLEMENTED; LOCAL ACCEPTANCE PENDING.** The purchasing/shelves changes already present in the working tree were retained. This continuation verifies 75 frontend tests (including 11 focused purchasing tests), contracts, TypeScript, ESLint, frontend production build and Go vet/tests/build. ESLint retains three existing warnings; Vite reports a bundle-size warning.

Current integration/database/browser verification is **BLOCKED**: `docker ps` cannot connect to `dockerDesktopLinuxEngine`, including outside the sandbox. `go test -race ./...` is **BLOCKED** because cgo is disabled. No migration, database test, browser scenario, commit, push or deployment was performed in this continuation. The [Phase 4 progress report](phase4-verification.md) distinguishes actual passes from unverified runtime gates. Earlier Phase 4 NOT STARTED statements below are historical, not current status.

## Phase 3 finalization (2026-10-10 Asia/Bangkok)

**Phase 3.1–3.7 and Phase 3 overall: COMPLETED (Local).** Work began with the October 9 execution context and continued past midnight locally. Phase 0/1A/1B/1C/2 remain COMPLETED (Local); Phase 4 is NOT STARTED. This is not production readiness.

The [detailed Thai report](phase3-verification.md) records architecture, changed files, scoped security review, actual commands, resolved failures and limits. Local evidence includes 132 checkout-flow plus 65 safety/concurrency assertions, 64 frontend tests, Go format/vet/race/build, additive contracts, fresh schema-6 migration, 17 real browser regressions, and catalog/inventory/auth/organization regression. All database changes were isolated to smartpos-auth-test and retained scratch databases; no primary-volume migration, commit/push or deployment occurred.

Earlier dated reports below remain historical evidence, including their then-current Phase 3 NOT STARTED statements.

## Phase 2 finalization (2026-10-09, continued from local chat history)

**Phase 2.1–2.6 and Phase 2 overall: COMPLETED for local acceptance gates.** Phase 0/1A/1B/1C remain COMPLETED (Local); Phase 3+ is NOT STARTED. This entry supersedes earlier Phase 2-not-started statements without deleting history. No commit, push, deployment, production operation, original-volume migration, history rewrite or volume deletion was performed.

### Starting repository and implemented scope

- The original Phase 2 start was clean on develop with Phase 1C already committed. Continuation preserved the unfinished Phase 2 diff. Reused Go/chi/pgx, React/Vite/TanStack Query, Golden Amber primitives, PostgreSQL, Caddy, sessions/CSRF/RBAC, audit and existing test frameworks. No dependency/lockfile changes or parallel agents.
- Phase 2.1: branch-local location hierarchy, type/status/revision, cycle and cross-tenant/branch protection, safe deactivation and system-managed transit.
- Phase 2.2: organization/location/Variant identity, immutable signed ledger, locked materialized balance/version, exact NUMERIC(18,3)/decimal-string quantities and positive one-time opening before history.
- Phase 2.3: request/submit/approve/post/reject/cancel, positive delta or absolute correction target, stale correction rejection and atomic all-item rollback. Owner/Manager self-approval is explicitly allowed and audited.
- Phase 2.4: selected-Variant quantity/version snapshots including zero identities, assigned physical entry, exact variance, approval/posting and stale snapshot rejection. Recount uses cancellation/new snapshot, not blind refresh.
- Phase 2.5: conserved same-branch pairs and inter-branch dispatch into transfer-specific transit, full explicit receipt and source/destination permission boundaries. Existing transit can be settled after source branch deactivation without permitting unrelated inactive-source mutations.
- Phase 2.6: real overview, reorder points, POS eligibility, ten routes, thirty inventory API path templates, filters/pagination, permission-aware actions, cancellation/scope-safe query keys, idempotent retries and catalog/navigation links. Inactive-branch quantities are visible only within allowed historical scope and have zero POS availability.
- Additive migration 5 creates seven FORCE-RLS tables with composite tenant/branch/location/Variant/document FKs. Runtime cannot directly write balances or rewrite/delete ledger. Definer posting checks tenant/user/owned pending operation with fixed search_path and revoked PUBLIC execution. Readiness requires clean schema 5. Applied migrations 1–5 were not subsequently rewritten.

Architecture, ledger invariants and state machines: [inventory](../architecture/inventory.md), [ledger](../database/inventory-ledger.md), [adjustments](../business-flows/inventory-adjustments.md), [counts](../business-flows/stock-counts.md), [transfers](../business-flows/stock-transfers.md).

### Environment and executed evidence

Windows/Node 24; existing isolated Compose project smartpos-auth-test, gateway localhost:18088, API loopback:18080, web loopback:15173 and internal PostgreSQL/Mailpit/AI. SQL acceptance fixtures roll back; HTTP/E2E fixtures create unique local accounts/organizations and persist only in that test stack. Default/original data/volumes were not migrated or reset. Final checks use the latest inactive-branch and form-style fixes, not earlier Docker images.

| Command / observation                                     | Result                                    | Scope / limitation                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Container gofmt -l on affected Go files                   | PASSED, no filenames                      | Final read-only format inspection                                                                                                          |
| Container go vet ./... and go test -race ./...            | PASSED all Go modules                     | Final source after availability fix; not production load testing                                                                           |
| npm run typecheck                                         | PASSED                                    | Current frontend source                                                                                                                    |
| npm run lint                                              | PASSED, 0 errors / 3 existing warnings    | Existing Fast Refresh warnings in AuthProvider, OrganizationProvider and AuthPages                                                         |
| npm test                                                  | PASSED, 58 tests / 11 files and contracts | Exact quantity/variance/client coverage plus prior modules                                                                                 |
| npm run contracts:check                                   | PASSED                                    | Inventory paths/permissions/idempotency/errors/precision, 16 modules / 106 target routes                                                   |
| npm run build                                             | PASSED                                    | Host production frontend bundle                                                                                                            |
| docker compose -p smartpos-auth-test build api web        | PASSED                                    | Final production images; Go build cached from identical source, web build executed                                                         |
| npm run verify:inventory                                  | PASSED, 135 assertions                    | Real Caddy/PostgreSQL, races, atomicity, idempotency, RBAC/branches/tenant, reconciliation and inactive-branch availability                |
| npm run verify:catalog                                    | PASSED, 116 assertions                    | Earlier Phase 2 regression pass; catalog behavior not changed afterward                                                                    |
| npm run verify:organization                               | PASSED                                    | Earlier Phase 2 API regression pass                                                                                                        |
| Auth API flow, spoofing/rate limits and SMTP outage tests | PASSED                                    | Earlier Phase 2 API regression; Mailpit restored afterward                                                                                 |
| node scripts/check-auth.mjs                               | PASSED, 16/16 browser tests               | Final auth/organization/catalog/inventory/foundation suite                                                                                 |
| Inventory E2E labeled steps                               | PASSED, 21 acceptance cases               | Real forms/actions, stale/negative errors, retry replay, Cashier/branch/stranger denial and organization switching                         |
| Inventory responsive assertions                           | PASSED, ten routes × seven widths         | 320/375/640/768/1024/1440/1920; no horizontal page overflow and keyboard checks                                                            |
| auth-integration-check                                    | PASSED                                    | Final rollback-only identity/organization/catalog/inventory SQL: schema5, RLS/FKs/runtime grants/precision/immutable ledger/atomic balance |
| integration-check                                         | PASSED                                    | Final foundation SQL, gateway routing, API/AI communication; expected public AI 404 prints wget warning                                    |
| migrate up; repeat up in isolated project                 | PASSED / no change                        | Migration5 applied earlier only to test stack; final rerun also no change                                                                  |
| docker compose -p smartpos-auth-test config --quiet       | PASSED                                    | No rendered secret-bearing config logged                                                                                                   |
| Caddy validate --config /etc/caddy/Caddyfile              | PASSED, Valid configuration               | Local HTTP only; production TLS not certified                                                                                              |
| Isolated Docker ps                                        | PASSED, six services healthy              | Original/default stack untouched                                                                                                           |

### Visual evidence and resolved failures

Final housekeeping PASSED: `npm run format:check` across the repository, `git diff --check`, and deep comparison preserving all 40 existing API paths and 38 existing schemas plus every prior component. All 782 local OpenAPI references and 64 links in changed Markdown resolve. The contract-only presentation cleanup restores original path/component formatting/order while retaining identical parsed Phase 2 content. The 49-file manifest below contains 21 created and 28 modified files; migrations 1–4, package-lock, environment/secrets and repository rules are untouched. No tests were removed, skipped or weakened.

Inventory E2E generates twenty loaded-page PNGs at 375/1440 under ignored test-results. Selected actual inspections include inventory-overview-1440.png, inventory-balances-375.png, inventory-counts-detail-375.png and inventory-transfers-detail-375.png; not all twenty are claimed manually inspected. Final overview and mobile balances were inspected again after the complete browser rerun.

Resolved without weakening tests/security: unsupported Button variant and union/type errors; fixture ambiguous SQL id; temporary YAML indentation error; stale Docker opening-branch validation; selectors corrected to actual accessible roles/names; tenant initialization no longer resets selection every navigation; disabled branch placeholder excluded from selectable-option count. Visual inspection found borderless fields, fixed by applying existing catalog-page styles. Inactive-branch availability was corrected and covered by four real API regression assertions. Final SQL/API/browser results passed.

During finalization, sandbox child-process/Docker access prevented initial checks/patching; approved escalated commands succeeded. One Go check shell failed on PowerShell quoting before executing tests, then corrected read-only format/vet/race check passed. These tooling failures are not represented as application passes.

### Scoped security review and limitations

SQL/API/browser evidence covers cross-tenant references, unauthorized branches, fixed role permissions, suspended/revoked memberships, CSRF/unknown JSON/body limits, immutable ledger/runtime grants, negative stock, duplicate requests/receipts, stale count/correction and all-item rollback. Organization lock plus balance locks prioritizes correctness; not an external penetration test, compliance assessment or high-throughput/deadlock/load certification.

Not run / not implemented: production deployment/migration, production LOGIN/TLS/secrets/backup-recovery certification, physical scanner/printer or multi-device hardware trials, sustained load testing, retention/cleanup jobs, reservations, valuation/costing, partial receipt, cancellation after dispatch, batch/expiry/returns or distributed counts. Owner/Manager self-approval is an explicit policy; denied-request auditing is not exhaustive. Category/actor filters use UUID fields. Phase 3 POS/payment and Phase 4 purchasing/shelf integrations remain unstarted and must not write balances directly.

### Changed-file manifest

Created:

- `apps/api/internal/modules/inventory/domain.go`
- `apps/api/internal/modules/inventory/domain_test.go`
- `apps/api/internal/modules/inventory/service.go`
- `apps/api/internal/modules/inventory/documents.go`
- `apps/api/internal/modules/inventory/transfers.go`
- `apps/api/internal/modules/inventory/queries.go`
- `apps/api/internal/modules/inventory/http.go`
- `apps/web/src/features/inventory/InventoryPage.tsx`
- `apps/web/src/lib/inventory-api.ts`
- `apps/web/src/lib/inventory-api.test.ts`
- `apps/web/src/styles/inventory.css`
- `database/migrations/000005_inventory.up.sql`
- `docs/architecture/inventory.md`
- `docs/database/inventory-ledger.md`
- `docs/business-flows/inventory-adjustments.md`
- `docs/business-flows/stock-counts.md`
- `docs/business-flows/stock-transfers.md`
- `tests/integration/inventory.sql`
- `tests/integration/inventory-fixtures.mjs`
- `tests/integration/inventory-flow.mjs`
- `tests/e2e/inventory.spec.ts`

Modified:

- `apps/api/internal/modules/organization/policy.go`
- `apps/api/internal/modules/organization/policy_test.go`
- `apps/api/internal/platform/database/database.go`
- `apps/api/internal/transport/router.go`
- `apps/web/src/app/router.tsx`
- `apps/web/src/app/routes.ts`
- `apps/web/src/features/catalog/CatalogUI.tsx`
- `apps/web/src/features/catalog/ProductPages.tsx`
- `apps/web/src/main.tsx`
- `packages/contracts/openapi.yaml`
- `scripts/check-contracts.mjs`
- `package.json`
- `tests/e2e/foundation.spec.ts`
- `tests/integration/auth-check.sh`
- `tests/integration/foundation.sql`
- `tests/integration/identity.sql`
- `tests/integration/organization.sql`
- `tests/integration/catalog.sql`
- `README.md`
- `TODO.md`
- `docs/architecture/overview.md`
- `docs/architecture/modules.md`
- `docs/architecture/routes.md`
- `docs/architecture/roadmap.md`
- `docs/database/overview.md`
- `docs/business-flows/stock-transfer.md` (historical target annotated)
- `docs/security/security-model.md`
- `docs/development/verification.md` (this entry; earlier history preserved)

## Phase 1C finalization (2026-10-09, continued from local chat history)

**Phase 1C.1 / 1C.2 / 1C.3 / 1C.4 and Phase 1C overall: COMPLETED for local acceptance gates.** Phase 0, 1A and 1B remain COMPLETED (Local); Phase 2 is NOT STARTED. This entry supersedes older catalog-not-started statements while retaining all historical results below. No commit, push, deployment, production operation, destructive migration or PostgreSQL volume deletion was performed.

### Repository findings and implemented scope

- Continued the selected unfinished Phase 1C implementation, preserving its working tree and completed identity/organization systems. Reused Go/chi/pgx, React/Vite/TanStack Query, Golden Amber management shell, PostgreSQL migrations, Caddy, existing audit/CSRF/RBAC and test frameworks. No dependencies or lockfiles were added/changed.
- Added organization-shared Products/categories/brands/units, required Variants, permanent uppercase SKUs, exact decimal-string prices, status/archive/restore, search/filter/sort/pagination and successful-change audit. Unit conversions are metadata, not inventory behavior.
- Added manufacturer/alias/internal barcode assignment, standards/checksum validation, same-tenant lookup, safe random internal CODE128 and SVG browser labels. Added CSV/XLSX mapping, bounded parsing, creator-private preview, CREATE/SKIP/UPDATE duplicate handling, revalidation, atomic confirmation and same-mode idempotency.
- Implemented all nine existing Products routes without changing the 16-module/106-route target. Reused tenant authorization rather than introducing another RBAC engine. Manager with no active assigned branch loses catalog access; operational staff use active organization membership plus fixed catalog grants, not an invented all-role branch gate. Catalog keys include user/organization/resource and deliberately share data across branches.
- Migration 4 adds seven FORCE-RLS tables, composite tenant FKs, exact NUMERIC prices/factors, identity/list indexes and limited runtime grants; readiness requires clean schema 4. Product/Variant/taxonomy history is preserved by status changes, not hard deletion.
- Focused architectural/API/import/role/Phase 2 boundaries are documented in [catalog design](../architecture/catalog.md). No image upload/storage, inventory ledger, branch prices, checkout or physical scanner/printer execution is claimed.

### Verification environment and actual results

Windows/Node 24 with the existing isolated Compose project `smartpos-auth-test`: Caddy `http://localhost:18088`, API `127.0.0.1:18080`, web `127.0.0.1:15173`, internal PostgreSQL/Mailpit/AI. Default/original Compose data and volumes were not migrated or reset by this finalization. Migration 4 was already applied to the isolated test database; the explicit migrate rerun reported no change. Test fixtures create their own uniquely named accounts/organizations/clients; rollback-only SQL leaves no persistent fixture rows. This is local evidence, not CI or a deployed production test.

| Command / observation                                                                                                 | Result                    | Evidence and boundary                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:catalog`                                                                                              | PASSED                    | 116 real Caddy/PostgreSQL API assertions: CRUD/taxonomy/variants, exact prices, permissions/tenant/CSRF, permanent SKU/barcode conflicts, CSV/XLSX, archive/restore, stale preview, atomic rollback and concurrent/idempotent confirmation. Includes a real 100-row bulk import plus pagination assertions. |
| `npm test`                                                                                                            | PASSED                    | 10 frontend files / 51 tests; contracts also pass. Catalog form/import/label/scanner/encoder tests join existing auth/organization coverage. Repeated successfully after final formatting.                                                                                                                  |
| `npm run typecheck`                                                                                                   | PASSED                    | TypeScript project checks; repeated after final formatting.                                                                                                                                                                                                                                                 |
| `npm run lint`                                                                                                        | PASSED with warnings      | Zero errors; three pre-existing react-refresh warnings in AuthProvider, OrganizationProvider and AuthPages. No unrelated refactor attempted.                                                                                                                                                                |
| `npm run build`                                                                                                       | PASSED                    | Production Vite frontend build on host; repeated after final formatting. The isolated web Docker production build also passed.                                                                                                                                                                              |
| `docker compose -p smartpos-auth-test --profile checks run --build --no-deps --rm api-check`                          | PASSED                    | gofmt gate, go vet, `go test -race ./...` and server build.                                                                                                                                                                                                                                                 |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm auth-integration-check`                     | PASSED                    | Identity/organization/catalog rollback-only SQL, composite FKs, unique/check constraints, exact numeric values, RLS and runtime grants.                                                                                                                                                                     |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm integration-check`                          | PASSED                    | Foundation schema 4, constraints/RLS/readiness and API/AI/Caddy wiring. Internal AI denial 404 is an expected negative assertion.                                                                                                                                                                           |
| `docker compose -p smartpos-auth-test run --no-deps --rm migrate`                                                     | PASSED                    | No change on already-applied clean schema 4; no original/default volume touched.                                                                                                                                                                                                                            |
| `npm run verify:organization`                                                                                         | PASSED                    | Real onboarding/invitation/tenant/Manager/CSRF/owner-concurrency/audit regression. Run sequentially with auth outage checks.                                                                                                                                                                                |
| `npm run verify:auth`                                                                                                 | PASSED                    | Authentication security API regression and full 15-test Playwright suite, including organization and catalog.                                                                                                                                                                                               |
| Phase 1C Playwright coverage                                                                                          | PASSED                    | One integrated catalog test covers the 17 labeled acceptance cases plus archive/restore and switch/reload/RBAC. Nine routes at seven widths (63 route/width overflow checks): 320/375/640/768/1024/1440/1920px. These are not 17 separate Playwright tests. Loaded tables/forms/product/labels are awaited. |
| Visual screenshot inspection                                                                                          | PASSED for captured views | Loaded mobile products, desktop product/Variants/barcodes and print-media labels inspected. Remaining viewports use runtime assertions, not full manual visual/accessibility certification.                                                                                                                 |
| `npm run format:check`                                                                                                | PASSED after scoped fixes | Entire repository Prettier check. Initial finalization check found routes.ts/OpenAPI formatting; only affected Phase 1C files were formatted, then check passed.                                                                                                                                            |
| `npm run contracts:check`                                                                                             | PASSED                    | Retains 16 modules / 106 unique documented routes and validates Phase 1C contracts/service health wiring.                                                                                                                                                                                                   |
| `git diff --check`                                                                                                    | PASSED                    | No whitespace/conflict-marker errors in tracked diff.                                                                                                                                                                                                                                                       |
| `docker compose -p smartpos-auth-test config --quiet`                                                                 | PASSED                    | Compose syntax/config validation, without printing environment secrets.                                                                                                                                                                                                                                     |
| `docker compose -p smartpos-auth-test exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` | PASSED                    | Live gateway configuration.                                                                                                                                                                                                                                                                                 |
| `docker compose -p smartpos-auth-test exec -T web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`   | PASSED                    | Live frontend Caddy configuration.                                                                                                                                                                                                                                                                          |
| `docker compose -p smartpos-auth-test ps`                                                                             | PASSED                    | api/web/caddy/postgres/ai/mailpit all healthy after outage restoration.                                                                                                                                                                                                                                     |

Captured ignored artifacts: `test-results/catalog-products-mobile.png`, `test-results/catalog-product-desktop.png` and `test-results/catalog-labels-print.png`. The mobile table scrolls internally with readable columns and no document overflow. Print tests stub `window.print` for invocation and separately use actual print-media CSS/SVG rendering; they do not execute the native dialog or printer hardware. Screenshots are evidence artifacts, not tracked application assets.

Python application code is unchanged; prior Python unit results are historical, not rerun Phase 1C unit evidence. Production TLS/SMTP/deployed IPv6, least-privileged LOGIN provisioning, CI/deployment certification, load/abuse testing, full accessibility/security audit, actual barcode hardware and automated stored-preview retention are NOT RUN/NOT IMPLEMENTED as applicable. Local bootstrap credentials remain development-only; no production secret/hardening assurance is claimed.

### Earlier failed attempts and resolutions

- Sandbox EPERM on TypeScript build-info writes was resolved through approved escalation; no sandbox/execution-policy change was made. Early Go gate failed formatting in import_http.go; fixed the callback formatting and reran the entire Go gate successfully.
- A new Testing Library assertion used an unsupported `exact` option; corrected the assertion and reran typecheck/tests/build. Browser checks exposed ambiguous selects, revision-key remounts erasing success messages and taxonomy navigation carrying state; explicit accessible names, stable editor keys and keyed taxonomy routes fixed the actual behavior.
- Mobile screenshots exposed one-character table columns; retained internal scrolling and added a sensible minimum width. Desktop capture initially saw loading; strengthened loaded-state waits before the final capture. No assertion was removed to hide overflow/loading.
- Foundation E2E still expected `/products` to be an unfinished 404. It now asserts the anonymous login redirect for the real authenticated route; the unfinished `/inventory` denial assertion remains. All 15 browser tests then passed.
- Running auth and organization outage suites concurrently caused shared Mailpit interference. Ran them sequentially after restoration; both passed without relaxing auth/rate/CSRF requirements or changing production settings.
- Final format check reported apps/web/src/app/routes.ts and packages/contracts/openapi.yaml. Formatted those two affected files and reran full formatting/contracts/frontend gates successfully. Earlier failed attempts are historical evidence, not counted as passes.

### Changed paths

Created:

- `database/migrations/000004_catalog.up.sql`; `docs/architecture/catalog.md`.
- `apps/api/internal/modules/catalog/domain.go`, `service.go`, `products.go`, `variants.go`, `barcodes.go`, `http.go`, `import_http.go`, `import_parser.go`, `imports.go`, `domain_test.go`, `import_test.go` (all in that catalog directory).
- `apps/web/src/features/catalog/ProductPages.tsx`, `ProductForm.tsx`, `TaxonomyPage.tsx`, `ImportPage.tsx`, `LabelsPage.tsx`, `CatalogUI.tsx`, `BarcodeManager.tsx`, `BarcodeScanner.tsx`, `catalog-hooks.ts`, `barcode-encoding.ts`, `CatalogPages.test.tsx`, `barcode-encoding.test.ts` (all in that catalog directory).
- `apps/web/src/lib/catalog-api.ts`; `apps/web/src/styles/catalog.css`.
- `tests/integration/catalog-fixtures.mjs`, `tests/integration/catalog-flow.mjs`, `tests/integration/catalog.sql`; `tests/e2e/catalog.spec.ts`.

Modified:

- `apps/api/internal/modules/organization/http.go`, `policy.go`, `service.go` (all in that organization directory); `apps/api/internal/platform/database/database.go`; `apps/api/internal/transport/router.go`.
- `apps/web/src/app/router.tsx`, `apps/web/src/app/routes.ts`, `apps/web/src/main.tsx`.
- `package.json`, `packages/contracts/openapi.yaml`, `scripts/check-contracts.mjs`.
- `tests/e2e/foundation.spec.ts`; `tests/integration/auth-check.sh`, `tests/integration/foundation.sql`, `tests/integration/identity.sql`, `tests/integration/organization.sql` (existing gates adapted to schema 4, not weakened).
- `README.md`, the existing `TODO.md`, `docs/architecture/overview.md`, `docs/architecture/modules.md`, `docs/architecture/routes.md`, `docs/architecture/roadmap.md`, `docs/architecture/organization.md`, `docs/database/overview.md`, `docs/development/verification.md`, `docs/security/security-model.md`.

The working tree remains uncommitted. Phase 2 requires a new explicit request: define stock ledger/balances, warehouse locations, quantity/rounding invariants, adjustments, counts and transfers using the stable catalog identities; no Phase 2 work started here.

## Phase 1B finalization (2026-10-09, continued from local chat history)

**Phase 1B.1 / 1B.2 / 1B.3 and Phase 1B overall: COMPLETED for the local acceptance gates.** Phase 0 and Phase 1A retain their local completed status; Phase 1C is **NOT STARTED**. This entry supersedes older statements that organization/RBAC is not started without deleting their historical evidence. No commit, push, deployment, destructive migration, volume deletion or production operation was performed.

### Repository findings and implemented scope

- Continued the selected chat's unfinished Phase 1B brief. Original working tree at implementation start was clean; retained the completed Phase 1A identity/rate-limit/reset mechanisms. Existing Go monolith, React/Vite/TanStack Query, PostgreSQL migrations, Golden Amber styling, Caddy/FastAPI topology and test frameworks remain; no dependency was added.
- Reused the existing organization/branch tables rather than adding a duplicate Store tenant. Added atomic onboarding/Owner/main branch/defaults/audit/idempotency, organization selection/switching/settings, branches, member role/status/branch assignment/removal, invitations, fixed-role policy and successful-change history.
- Six actual pages: `/setup`, `/settings/store`, `/settings/branches`, `/employees`, `/employees/:id`, `/roles`; existing 16-module/106-route inventory preserved. Catalog, stock, purchasing, checkout/payment and broad approval/audit pages remain unimplemented.
- Architecture, endpoint map, transaction boundaries and security decisions: [organization design](../architecture/organization.md). Live request/response schemas: `packages/contracts/openapi.yaml`. Member response is an independent object, not an invalid closed-input `allOf` composition.

### Scoped authorization/security findings

- Real HTTP checks pass cross-tenant reads/updates/deletes/branch assignments and Manager all-old/all-new-branch denial. Manager cannot edit self/Owner/Manager or promote them; operational staff cannot manage memberships/settings. Inactive branches are removed from actor context; a Manager without active branches loses employee/role/audit permissions. OWNER inputs cannot carry meaningless branch assignments.
- Last active Owner demotion/suspension/removal and competing-owner removals preserve one Owner. Application organization-row serialization plus deferred SQL constraints and no runtime hard-delete grant protect this boundary. New organizations cannot commit without an Owner; migration does not guess owners for legacy bootstrap rows.
- Invitations store only hashed tokens, bind email, expire, revoke, accept once and recheck inviter authority/current branches. Real recipient mismatch, replay/expiry/revocation/concurrent acceptance tests pass. SMTP outage returns 503 with no pending invitation row and restores Mailpit. API responses and inspected application logs contain no raw invitation/session token or password.
- Existing Origin/CSRF checks remain on authenticated writes. Identity registration/login/logout/recovery/reset/session revocation, independent client limits and Caddy/direct forwarding spoofing regressions pass without increasing thresholds or clearing counters.
- Pool connections select `smartpos_runtime` (NOSUPERUSER/NOBYPASSRLS). Rollback-only SQL proves organization/branch RLS and cross-tenant composite constraints. **Membership/invitation/new related tables are explicitly application-scoped, not full DB RLS.** Local privileged bootstrap credentials remain a production limitation; this is not isolation from arbitrary SQL or a formal production security audit.
- Frontend caches are keyed/scoped by user/org/branch and removed/cancelled on switch/logout; tokens stay in memory. API access revokes immediately; UI context revalidation is focus/30 seconds. Successful changes are transaction-audited; denied actions are not all persisted to the organization audit table.

### Executed checks and observed results

Environment: Windows PowerShell, Node 24, Docker Desktop Linux containers; isolated Compose project `smartpos-auth-test`; real Caddy gateway on loopback port 18088, API 18080, web 15173, internal PostgreSQL/Mailpit. Caddy/API trusted-network defaults `.2`/`.3` inside `172.30.42.0/28` were retained. No test targeted production or an original development volume.

| Command/check                                                                                                                                                                                                                                 | Result                    | Evidence and boundary                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                                                                                                           | PASSED                    | TypeScript project build/typecheck. Initial sandbox EPERM was rerun through approved escalation.                                                                                                                                                           |
| `npm run lint`                                                                                                                                                                                                                                | PASSED with warnings      | Zero errors, three react-refresh export warnings: two pre-existing, one OrganizationProvider. No rule was disabled.                                                                                                                                        |
| `npm run test`                                                                                                                                                                                                                                | PASSED                    | Eight frontend files / 22 tests (16 prior + six added), including onboarding and cache/selection/logout behavior; contract checks also run.                                                                                                                |
| `npm run contracts:check`                                                                                                                                                                                                                     | PASSED                    | 16 modules/106 unique routes, live endpoints/session/CSRF contracts; response schema regression assertion added.                                                                                                                                           |
| `npm run build`                                                                                                                                                                                                                               | PASSED                    | TypeScript/Vite production bundle. Local/Docker web build both passed.                                                                                                                                                                                     |
| `docker run --rm --network none --mount 'type=bind,source=D:\!Project\smartPOS(Web_Application)\apps\api,target=/src' smartpos-auth-test-api-check sh -c 'gofmt -w internal && go vet ./... && go test -race ./... && go build ./cmd/server'` | PASSED                    | Host Go unavailable; actual existing check image ran format, vet, race tests and server build, including organization policy/validation tests.                                                                                                             |
| `docker compose -p smartpos-auth-test up --build -d --wait api web`                                                                                                                                                                           | PASSED                    | Rebuilt local services and waited for schema/health; later focused API rebuild also passed. Process-local test ports/PUBLIC_ORIGIN used, no persisted production config.                                                                                   |
| `docker compose -p smartpos-auth-test run --no-deps --rm migrate`                                                                                                                                                                             | PASSED                    | Migration 3 applied successfully in isolated test volume; up rerun reports `no change`. No down/drop operation or original-volume migration.                                                                                                               |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm auth-integration-check`                                                                                                                                             | PASSED                    | Existing identity assertions retained; now also runs rollback-only organization SQL: membership uniqueness, cross-tenant FK, last-owner/new-owner constraints, runtime role flags and tenant RLS.                                                          |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm integration-check`                                                                                                                                                  | PASSED                    | Foundation constraint/RLS/schema3 checks and actual API/AI/gateway readiness/routing. Expected internal AI 404 is a passing denial assertion, not a failure.                                                                                               |
| `npm run verify:organization`                                                                                                                                                                                                                 | PASSED                    | Real gateway/PostgreSQL/Mailpit onboarding/idempotency, branch uniqueness/isolation, Manager scope/escalation, membership revocation, invitations, owner concurrency, Origin/CSRF, sanitized logs and runtime role flags; SMTP outage restored in finally. |
| `npm run verify:auth`                                                                                                                                                                                                                         | PASSED                    | Existing real auth/security API regression and **all 14 Playwright tests**, not just organization. Thirteen previous tests + one integrated organization test.                                                                                             |
| Phase 1B browser coverage                                                                                                                                                                                                                     | PASSED                    | One integrated test includes the 15 labeled E2E acceptance cases, plus six pages at seven widths (42 page/width checks), keyboard focus, switching/cache/reload and revoked access. These are not 15 standalone Playwright tests.                          |
| Screenshot inspection                                                                                                                                                                                                                         | PASSED for captured views | Actual loaded branches at 320px and roles matrix at 1440px inspected in `test-results/organization-branches-mobile.png` / `organization-roles-desktop.png`. Other widths use runtime overflow assertions, not a full visual/accessibility audit.           |

Final handoff checks also passed: `npm run format:check`, `npm run contracts:check`, `git diff --check`, `docker compose -p smartpos-auth-test config --quiet`, and `docker compose -p smartpos-auth-test exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` (also repeated for `web`). Compose `ps` confirmed api/web/caddy/postgres/ai/mailpit healthy after outage restoration. Final diff inspection retained existing tests/security assertions, contained only Phase 1B-related changes and left the tree uncommitted.

Python application code is untouched; its previous Phase 0 unit results are historical and were not rerun as Phase 1B unit evidence (live AI readiness remains in the integration smoke). CI, production TLS/SMTP/deployed IPv6/load/accessibility certification were not run.

### Earlier failed attempts and resolutions

- Filesystem/Docker sandbox access and Windows apply_patch quoting/command-size attempts failed; used approved escalation and the actual apply_patch engine. No execution-policy change or approval bypass was made. One later helper path typo ran no edits and was corrected.
- A mismatched test proxy subnet briefly stopped API startup; restored the existing matching `172.30.42.0/28` and fixed addresses, preserving networks/data/volumes. Stack returned healthy; no production topology was changed.
- Initial OpenAPI brace errors were corrected. Closed MemberInput composition was replaced with an explicit Member response schema; a regression assertion prevents reintroducing that contract issue.
- A synchronous test Mailpit read outlived an HTTP keepalive socket; isolated integration client uses `Connection: close`, not relaxed limits. Logout test now asserts removal of the previous user's cache and absence of anonymous data instead of treating disabled empty queries as leaked data.
- E2E first exposed ambiguous label selection/uppercase fixture expectations; actual accessible aria labels and explicit expected normalization were corrected. An early desktop capture showed loading, so captures now wait for loaded table/heading. A later screenshot locator chose hidden mobile sidebar text; fixed to the visible branch card heading without weakening assertions. Whole 14-test suite then passed.
- OWNER branch-input validation initially preceded Manager escalation denial and produced 400 instead of the existing expected 403. Authorization now precedes that validation; the existing security assertion is retained, with a new authorized-invalid-input 400 case.
- Prettier initially reported the new organization design Markdown table; only affected files were formatted before the final check. Prior failures remain historical evidence, not hidden or counted as passes.

### Changed paths

Created:

- `database/migrations/000003_organization.up.sql`.
- `apps/api/internal/modules/organization/policy.go`, `policy_test.go`, `service.go`, `members.go`, `invitations.go`, `http.go` (all in that directory).
- `apps/web/src/lib/organization-api.ts`; `apps/web/src/app/OrganizationProvider.tsx`, `apps/web/src/app/OrganizationProvider.test.tsx`; `apps/web/src/features/organization/OrganizationGate.tsx`, `apps/web/src/features/organization/OrganizationPages.tsx`, `apps/web/src/features/organization/OrganizationPages.test.tsx`.
- `tests/integration/organization.sql`, `tests/integration/organization-flow.mjs`, `tests/e2e/organization.spec.ts`; `docs/architecture/organization.md`.

Modified:

- `apps/api/internal/modules/identity/http.go`, `apps/api/internal/modules/identity/mailer.go`, `apps/api/internal/platform/database/database.go`, `apps/api/internal/transport/router.go`.
- `apps/web/src/app/providers.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/routes.ts`, `apps/web/src/features/auth/AuthPages.tsx`, `apps/web/src/layouts/ManagementLayout.tsx`, `apps/web/src/styles/global.css`.
- `package.json`, `packages/contracts/openapi.yaml`, `scripts/check-contracts.mjs`, `tests/integration/auth-check.sh`, `tests/integration/foundation.sql`, `tests/integration/identity.sql`.
- `README.md`, existing `TODO.md`, `docs/architecture/overview.md`, `docs/architecture/modules.md`, `docs/architecture/routes.md`, `docs/architecture/roadmap.md`, `docs/security/security-model.md`, `docs/development/getting-started.md`, `docs/development/verification.md`.

### Limitations and handoff

Not production-ready: privileged bootstrap login credentials, limited RLS scope, synchronous non-outbox invitation SMTP, best-effort password-reset queue, per-tenant coarse locking, bounded non-paginated audit/invitation lists, no custom roles/operational APIs, legacy-owner reconciliation, brief stale UI before revalidation and three lint warnings remain. See architecture/security docs for exact boundaries. Screenshots/reports/traces are ignored local artifacts and can contain synthetic auth material; do not publish them as sanitized production logs.

Phase 1C can build catalog/categories/brands/units/variants/barcodes on the verified tenant membership boundary after a separate request. It needs its own permission additions, schema/contracts/uniqueness rules and tenant/branch tests. No Phase 1C code is included here. Earlier Phase 0/1A reports below are preserved unchanged.

## Phase 1A finalization (2026-10-09, resumed local verification)

**Phase 1A: COMPLETED for the local acceptance gate.** This entry supersedes the PARTIAL checkpoint below without removing its historical evidence. Phase 0 remains COMPLETED (previous report); Phase 1B and Phase 1C are NOT STARTED. No production release, commit, push or tenant/RBAC implementation is included.

### Findings and fixes

- Retained the prior trusted-peer resolver, bounded asynchronous reset worker and all pre-existing working-tree changes. Go accepts one exact Caddy peer, ignores `X-Real-IP`, and rejects ambiguous/malformed forwarded addresses; no rate-limit threshold was increased.
- Reproduced Caddy startup failure with `Address already in use`: Docker had dynamically allocated Caddy's intended `.2` proxy address to Go. Fixed Go at `.3` on the dedicated two-service proxy network; Caddy then started and gateway readiness passed.
- Hardened SMTP deadlines/cancellation without changing the existing mailer interface or public HTTP envelope. The public forgot-password path queues before account lookup/delivery; real Mailpit outage produced identical 202 responses for known/unknown accounts and a sanitized worker failure. Mailpit was restored.
- Fixed pending login/logout responses overwriting a newer cleared/authenticated frontend generation; three regression tests cover delayed login after clear, delayed logout after a newer login, and expired-session refresh. Existing reset-token URL cleanup and Golden Amber styling remain intact.
- Corrected verification infrastructure rather than lowering protections: each real client has one stable fixture IP; existing counters/account limits are retained. Tests wait for a newly delivered asynchronous reset message, preserve expiry constraints when backdating synthetic rows, and support the Playwright module loader and HTTP proxy CONNECT behavior. Logout assertions retain the valid protected-route `returnTo` redirect.

### Executed checks

| Command/check                                                                                     | Result               | Evidence and boundary                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                                            | PASSED               | Repository Prettier check, including the updated tests/documentation. An early explicit attempt to format `.env.example` was unsupported; the repository check correctly uses its configured file selection.                                                                                                                      |
| `npm run lint`                                                                                    | PASSED with warnings | Zero errors; the existing two `react-refresh/only-export-components` warnings remain in auth files.                                                                                                                                                                                                                               |
| `npm run typecheck`, `npm test`, `npm run build`                                                  | PASSED               | Six frontend test files / 16 tests; contract inventory check; TypeScript and Vite production build.                                                                                                                                                                                                                               |
| `docker compose -p smartpos-auth-test --profile checks run --build --no-deps --rm api-check`      | PASSED               | `gofmt`, `go vet`, race-enabled tests and server build. Includes trusted IPv4/IPv6 peers, duplicate/malformed forwarding, queue behavior, SMTP context deadline and development/production cookie policy. No host Go install was needed.                                                                                          |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm auth-integration-check` | PASSED               | Existing identity SQL assertions ran inside BEGIN/ROLLBACK: schema version 2 clean, normalized email uniqueness, single-use token consumption and session revocation.                                                                                                                                                             |
| Isolated `docker compose ... up --build -d --wait`                                                | PASSED after fix     | Up migration rerun exited successfully; existing PostgreSQL volume retained. Caddy/API/web/PostgreSQL/AI/Mailpit healthy. No down/drop or volume deletion.                                                                                                                                                                        |
| `npm run verify:auth`                                                                             | PASSED               | Real Caddy/PostgreSQL/Mailpit API flow, IP/account counter assertions, spoofing/direct-API checks and SMTP outage; then all 13 Playwright tests passed (two auth scenarios plus 11 foundation regressions). Repeated suites use fresh real fixture clients, not cleared counters or rotated identities during a limiter scenario. |
| Caddy `validate`, `docker compose config --quiet`                                                 | PASSED               | Actual gateway configuration and Compose syntax. Existing forwarding defaults were not replaced with duplicate custom forwarding headers.                                                                                                                                                                                         |
| Actual browser/screenshot inspection                                                              | PASSED within scope  | Reset page at 320px and account page at 1440px inspected; foundation overflow/interactions checked at 320-1920px. `test-results/auth-reset-mobile.png` and `test-results/auth-account-desktop.png` are ignored local artifacts. No full accessibility audit is claimed.                                                           |
| `git diff --check`, final working-tree review                                                     | PASSED               | Focused auth/config/test/documentation changes; no migration/schema modification, dependency addition, deleted/weakened test, secret-bearing environment file, commit or deployment.                                                                                                                                              |

The integrated auth checks cover registration/duplicate handling, invalid/valid login, refresh persistence, unauthenticated account access, allowed/disallowed Origin, CSRF rejection, logout revocation, reset mail delivery, old-password denial, active-session revocation, reset replay/expiry, session expiry, HTTP cookie attributes, referrer/CSP headers, unchanged 429/Retry-After behavior, direct untrusted headers and independent actual clients. Database IP/account counters are observed rather than inferred from unit tests alone. The Playwright limiter scenario checks forged headers and independent clients against the real gateway/direct backend.

### Scoped security assessment and limitations

**COMPLETED:** Authentication-boundary review of Argon2id input limits, hashed session/reset persistence, atomic one-time reset/session revocation, generic forgot-password/SMTP-failure responses, exact proxy trust, Origin/CSRF, cookie policy, generic errors and application-log handling. Original critical acceptance blockers were resolved in this local topology. Synthetic passwords/reset tokens were checked against captured API logs without printing those logs. This is not an external audit or production security certification.

**PARTIAL / NOT VERIFIED outside the local gate:** Production TLS and real authenticated SMTP provider delivery; production secret/runtime-role/backup/retention/abuse operations; deployed IPv6 networking (resolver behavior is unit-tested); NAT-level client distinctions unavailable at the network boundary. Reset queue delivery is process-local/best-effort, has no automatic retry and can lose entries on restart/saturation; operators must monitor failures. The test engine did not publish requested ports for internal-only PostgreSQL/Mailpit, so mailbox/SQL verification used internal container access; host Mailpit UI was not verified. Conservative `Retry-After` values advertise the full window rather than exact remaining seconds.

No additional authentication acceptance test is blocked. Existing React Fast Refresh warnings are not treated as test failures. The isolated stack remains running and healthy; fixture containers are removed, but synthetic auth-test records/counters and the original database volume are intentionally preserved. Mailpit was the only temporarily stopped service during the new outage check. Foundation resilience outages/AI checks were not rerun because no AI/resilience implementation changed.

### Changed paths in the resumed worktree

- Backend/config: `.env.example`, `apps/api/.env.example`, `apps/api/cmd/server/main.go`, `apps/api/internal/modules/identity/http.go`, `apps/api/internal/modules/identity/service.go`, `apps/api/internal/modules/identity/mailer.go`, `apps/api/internal/platform/config/config.go`, `apps/api/internal/platform/config/config_test.go`, and identity `http_test.go`, `service_test.go`, `mailer_test.go`.
- Frontend/tests: `apps/web/src/app/AuthProvider.tsx`, `apps/web/src/app/AuthProvider.test.tsx`, `tests/e2e/auth.spec.ts`, `tests/integration/auth-flow.mjs`, new `tests/integration/auth-client.mjs`, new `tests/integration/auth-fixtures.mjs`, new `scripts/check-auth.mjs`, `playwright.config.ts`, `package.json`.
- Topology/docs: `docker-compose.yml`, `README.md`, existing `TODO.md`, `docs/api/conventions.md`, `docs/architecture/overview.md`, `docs/architecture/roadmap.md`, `docs/security/security-model.md`, `docs/deployment/local.md`, `docs/development/getting-started.md`, this verification report. Earlier modifications/untracked files were preserved, not attributed solely to this resumed turn.

## Phase 1A authentication checkpoint (2026-10-09)

Phase 1A code is present but is **PARTIAL**, not release-ready. This checkpoint preserves the Phase 0 evidence below and records only checks actually observed for the current auth implementation.

| Check                                                                                 | Result               | Evidence or limitation                                                                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`              | Passed               | Six frontend test files / 13 tests, OpenAPI/route inventory check, TypeScript and Vite production build.                                                          |
| `npm run lint`                                                                        | Passed with warnings | No errors; two `react-refresh/only-export-components` warnings in auth files.                                                                                     |
| `docker compose config --quiet`, `git diff --check`                                   | Passed               | Compose syntax and tracked diff whitespace check.                                                                                                                 |
| Earlier session: Go unit checks and isolated `auth-integration-check`                 | Previously passed    | Go package tests and rollback-only identity SQL assertions were observed before the latest frontend and backend edits; not a current full regression pass.        |
| Earlier session: `node tests/integration/auth-flow.mjs`                               | Failed               | A later login returned HTTP 429 rather than 200 under the existing five-attempt shared-IP limit. This is not converted to a pass by increasing the limit.         |
| Current Go checks, PostgreSQL auth flow, Playwright auth E2E, gateway/cookie behavior | Blocked/not run      | No local Go toolchain and the Docker Desktop Linux daemon is unavailable (`docker info` cannot connect). Do not infer runtime success from build/contract checks. |

The backend currently uses the Caddy container peer address for its per-IP bucket. Distinct browsers behind that gateway may share the same five-attempt limit, and integration/E2E runs can affect each other for ten minutes. A trusted-proxy client-IP design with spoofing tests is needed before declaring the rate limiting production-ready. SMTP failure is logged and returns the same generic forgot-password response as an unknown account; delivery timing can still vary. Production TLS, real SMTP delivery, permissions, tenant isolation, and deployment are not verified here.

Phase 0: COMPLETED (previously reported). Phase 1A: PARTIAL. Phase 1B: NOT STARTED. Phase 1C: NOT STARTED.

## Phase 0 (previously reported)

The checks below were executed against the local development stack. They are evidence for the foundation only, not for the planned business modules or a production deployment.

| Check                                                       | Result | Evidence                                                                                                                         |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | Passed | Prettier, ESLint and TypeScript completed without errors.                                                                        |
| `npm test`                                                  | Passed | 4 frontend test files / 8 tests; contract check confirmed 16 modules, 106 unique documented routes and foundation health wiring. |
| `npm run build`                                             | Passed | TypeScript and Vite production build completed.                                                                                  |
| `npm run e2e`                                               | Passed | 11 Playwright tests, including seven viewport widths (320-1920px), navigation, unfinished-route handling and readiness states.   |
| `npm run verify:api`                                        | Passed | `gofmt`, `go vet`, race-enabled Go tests and Go server build in the check image.                                                 |
| `npm run verify:ai`                                         | Passed | Ruff lint/format, application import and 7 pytest tests; one upstream Starlette deprecation warning.                             |
| `npm run verify:integration`                                | Passed | PostgreSQL schema/constraints/RLS, service communication, health responses and Caddy gateway routing. SQL assertions roll back.  |
| `docker compose config --quiet`, `npm run migrate`          | Passed | Compose configuration valid; migration up rerun reported `no change`. No down/drop or volume deletion was run.                   |
| Caddy `validate` in gateway and web containers              | Passed | Both active configurations validated.                                                                                            |
| `docker compose ps`                                         | Passed | PostgreSQL, API, AI, web and gateway reported healthy in the local stack.                                                        |

The prior implementation session also ran `npm run verify:resilience` successfully: AI outage did not change Go readiness, database outage produced live 200 / ready 503, Go handled SIGTERM gracefully, and the local stack was restored. This disruptive check was not rerun during the final verification pass.

## Phase 0 acceptance boundary

- **Implemented and locally verified:** monorepo foundation, three starting services, PostgreSQL migration/connection, Caddy routing, Golden Amber tokens and responsive layouts, health/readiness, environment examples and development commands.
- **Documented, not implemented:** the 16 business modules and 106 planned routes. Only foundation presentation routes are active. Authentication, product/inventory CRUD, checkout, payments, reports and forecasting remain future work.
- **Not verified:** GitHub Actions execution, production deployment, real users/data, production TLS/secrets, and cross-machine reproducibility. CI configuration is present but no remote run is claimed.
- **Local environment:** Docker Desktop Linux engine, Node 24 and installed Chromium were available. The Compose stack remains running and its named PostgreSQL volume is preserved; stop it with `npm run stack:down` when no longer needed.
