# Restaurant Without Legacy POS Implementation Plan

## Branchless creation prerequisite (2026-11-15)

`organization.Service.CreateRestaurant` now provides organization-only creation,
with OWNER membership, idempotency and audit in the same transaction. It has no
public route yet. Keep the old endpoint unchanged until setup and its callers no
longer require branch rows; exposing branchless creation early would strand users
in the current setup flow. Legacy creation bytes and branch behavior are retained.
No schema changes or historical rewrites are required for this prerequisite.
Rollback before public cutover is a source-only revert of this scoped delta;
the isolated acceptance fixtures are disposable, not primary restaurant data.

Remaining critical path: organization-scoped setup/settings/menu/table/queue
schema and APIs, branchless orders and direct settlement, then frontend cutover
and full migration/permission/concurrency/browser acceptance.

## Organization Setup Checkpoint (2026-11-16)

Migration 37 adds an organization-scoped typed restaurant profile aggregate,
dining zones/tables and durable setup command replay. Existing legacy tables and
history remain unchanged. Organization locking serializes setup writes; scoped
RLS and composite organization/zone relationships protect the new tables.
Empty branch scope selects this path; legacy callers must provide an explicit
branch. There is no implicit default branch. New public creation and UI cutover
remain deferred until operational menus/orders and settlement can use this scope.

Fresh isolated DB acceptance passes branchless creation/setup, concurrent replay,
authorization negatives, transaction rollback, exact charges and zero legacy
infrastructure creation. Empty down/reapply succeeds; down refuses populated
new tables. After real setup data exists, use forward recovery, not deletion.
Final full DB run passes explicit legacy onboarding and still fails on the same
four baseline-reproduced leaf cases. See TODO.md and local setup evidence logs.
Go package tests/vet, web tests (92), typecheck, contracts and scoped formatting
pass. Supplied-source independent review reports no confirmed scoped defect;
it does not approve the whole flow or establish QR redemption/retention safety.
Build success is not browser acceptance. No primary migration or deployment.

Next boundary: organization-scoped operational menu/storefront/order identities,
direct cash/payment settlement and QR/kitchen consumers. Do not expose branchless
creation or remove legacy dependencies before their replacements are accepted.

## Approved Direction

**Goal:** Setup, menus, orders, confirmed payment, kitchen, fulfillment and receipts
without branches, stock locations, terminals, POS carts or shifts in new operations.

**Architecture:** React -> Go -> PostgreSQL. Preserve historical TRACKED records
and recovery. Introduce guarded direct restaurant financial transactions.
One restaurant is one organization. New operations and authorization use the
organization boundary, not branch selection or an automatically created branch.

**Scope:** Full chat flow approved on 2026-11-15. Main implements and integrates;
architect supplies read-only dependency assessment. Independent review required.
Specialist default model routing is unverified; no model substitution is allowed.
No primary migration, external service calls, push, deployment or history deletion.

## Acceptance And Recovery
- Fresh restaurant setup and sale need no branch, warehouse, terminal, cart or shift.
- No branch creation, selection, branch_id requirement or active-branch gate in
  new setup, menu, table/QR, order, payment, kitchen or fulfillment operations.
- Preserve organization isolation; removing branches does not grant access to
  another organization's records or broaden existing staff permissions.
- Cash and online funds have durable, distinct evidence; no fabricated provider IDs.
- Keep exact amounts, paid-only kitchen, refund/review exclusions and tenant scope.
- Fulfillment atomically writes one sale/receipt, payment, order event and audit.
- Verify replay, stale revisions, concurrency and rollback on partial failure.
- Preserve legacy rows and open TRACKED transactions and their immutable history.
- Add migrations, never edit applied migrations. Test only on a confirmed task-owned
  disposable database, not primary databases or retained volumes.
- Before new writes, recover task-owned changes on the isolated target. After
  writes, recover forward; never delete history to restore incompatible constraints.

## Execution
### 1. Menu-Only Source Boundary
This checkpoint predates the user's no-branch clarification. Its active-branch
gate remains an interim dependency to replace in step 2, not new-flow acceptance.
- [x] Add focused source-policy tests; initial undefined-helper RED was recorded
  earlier in this task, followed by GREEN. No full-flow RED/GREEN claim.
- [x] Keep active organization/branch and historical TRACKED source validation.
- [x] Focused Go tests, real PostgreSQL source-boundary checks and independent
  supplied-source/evidence review. No findings in this slice; reviewer ran no tests.

### 2. Organization-Scoped Restaurant And Order Source
- [ ] Add organization-scoped direct-source discrimination and compatibility
  constraints, retaining branch references only for legacy recovery/history.
- [ ] Update settings, catalog, quotes, orders and public contracts coherently.
- [ ] Remove branch/terminal selection from the new UI; preserve safe
  pending/error/retry states without creating a hidden default branch.
- [ ] Scope menus, tables/QR, kitchen queues, setup and cache keys to the restaurant
  organization; preserve server-side staff authorization and deny foreign access.
- [ ] Test a restaurant with no branch/terminal/stock rows, inactive historical
  branches, organization switching, old orders and migrations.

### 3. Direct Restaurant Financial Transactions
- [ ] Define cash confirmation/refund evidence and authenticated permissions.
- [ ] Implement atomic direct sale/receipt from frozen order/payment snapshots.
- [ ] Keep database guards, refund exclusions and organization lock discipline.
- [ ] Test exact totals, revisions, replay, races, scope and rollback.

### 4. Replace Active Legacy Operations
- [ ] Replace /pos with restaurant order entry and payment confirmation.
- [ ] Preserve dine-in, pickup, delivery and fulfillment semantics.
- [ ] Retire unused stock/recipe/shift routes only after replacements pass.
- [ ] Update consumers, OpenAPI, route inventory and relevant documentation.

### 5. Acceptance
- [ ] Unit/contract checks, typecheck, lint and build.
- [ ] Isolated real database migration/legacy/transaction/permission checks.
- [ ] Desktop/mobile browser and recovery checks.
- [ ] Independent correctness/security review and resolution of findings.
- [ ] Remove this task's TODO section only after every acceptance gate passes.

## Evidence Limits
Static checks are not database acceptance. Builds are not browser acceptance.
The flow is not complete until required checks and independent review pass.

## Current Checkpoint (2026-11-15)
These results cover the earlier source-boundary slice. They do not prove the
subsequently clarified no-branch behavior; that acceptance remains pending.
- Fresh package regression: `go test ./internal/modules/storefront
  ./internal/modules/restaurant ./internal/modules/pos -count=1` PASS. DB/browser
  environment unset for this command; its integration skips are not acceptance.
- Real isolated PostgreSQL: existing local 17.6 image, official migrations 1-36,
  runtime role, confirmed marker and empty initial users. Selected
  `TestSingleStoreIsolatedDatabase/(menu-only_zero-stock_sales|separate_front_and_back_online_stock_sources)`
  PASS, including inactive-branch denial and inactive-terminal TRACKED denial.
- Full DB suite FAIL on four leaf cases: directory storefront constraint, foreign
  invitation, pinned invitation and reconciliation authority revocation. A HEAD
  overlay baseline on a fresh DB reproduces all four. No unrelated fixes made.
- Logs: `.local/restaurant-source-db-check.log`,
  `.local/restaurant-source-db-full-current.log`,
  `.local/restaurant-source-db-baseline.log`. Local adapter:
  `.local/restaurant-source-db-check.mjs`; set
  `RESTAURANT_SOURCE_FOCUSED=1` to select the affected suites. The adapter uses
  existing images only, streams only a compiled test binary into an internal
  network, and checks ownership labels before removing its tmpfs DB/network.
- Windows-to-WSL loopback and drive mapping were unavailable. The corrected
  adapter runs the Linux test binary inside the DB network namespace, preserving
  the test's 127.0.0.1:15514 target guards. No primary target or external provider.
- Current formatting and diff whitespace checks PASS. No frontend changes or
  browser evidence in this slice. No commit, push or deployment.

## Next Dependency Boundary
`storefront.settings` still joins terminals. `SaveSettings` and `CreateOrder`
still require terminal/location identities. `pos.SettlePrepaidOnlineOrder` still
requires a cart and shift. Do not remove old routes before these are replaced.

Use a forward migration with a direct-restaurant discriminator and scoped
organization/order relationships, without requiring a branch for new records.
Retain existing branch relationships on historical records. Preserve the legacy
code paths of `online_order_guard`
(14), settlement insert guards (6), `pos_sale_consistency` (32),
`online_order_consistency` (22), payment/refund guards (23), prepaid consistency
(20), and fulfillment review guards (21). Cash evidence must be distinguished
from provider evidence (17/19); never invent provider IDs. Once direct rows exist,
restoring legacy non-null constraints requires forward recovery, not row deletion.
