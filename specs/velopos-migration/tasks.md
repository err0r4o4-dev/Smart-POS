# VELOPOS Migration Task Plan

Status: PLANNING ONLY - no implementation authorized by this document
Plan date: 2026-11-19 (Asia/Bangkok)
Prerequisites: `requirements.md` and `design.md`

## 1. Execution rules

- Follow `requirements.md -> design.md -> tasks.md`.
- Use `[ ]` for pending work, `[?]` for blocked work, and `[x]` only when
  the named validation evidence exists.
- Do not edit applied migrations, delete business data, reset retained volumes,
  push, deploy, or change production infrastructure in this plan.
- Preserve current retail routes and data until replacement acceptance passes.
- Replace `VP-UNVERIFIED-*` links with the supplied approved requirement IDs
  before implementation starts.
- Any task that changes authorization, payment, data integrity, tenant scope,
  migration behavior or deployment requires independent review.

## 2. MVP boundary

### MVP goal

Deliver one verified restaurant ordering path, from setup and menu publication
through customer order, approved payment confirmation, strict FIFO kitchen
queue, fulfillment, receipt/history and recovery, without breaking retained
retail records.

### MVP includes

- organization/restaurant setup and menu management;
- public restaurant directory and storefront catalog;
- single-restaurant customer cart/order and private tracking;
- the approved payment mode(s), idempotency and reconciliation;
- paid-before-kitchen enforcement;
- strict FIFO queue and fulfillment transitions;
- receipt/audit/recovery behavior;
- tenant/RBAC/security, migration and responsive/browser acceptance.

### Advanced, post-MVP candidates

- multi-restaurant basket or marketplace commissions;
- delivery provider integrations and customer accounts;
- real payment-provider production certification;
- inventory/recipe forecasting and AI recommendations;
- reports, tax, hardware, offline mode, high availability and disaster drills.

These are not approved scope until mapped to the 92-item register.

## 3. Phase 0 - requirements and decision gate

### T0.1 Import the approved requirements register

- [?] Obtain the complete 92 approved VELOPOS requirements, IDs, priorities,
  dependencies and acceptance criteria from the product authority.
- [ ] Replace `VP-UNVERIFIED-001..092` in `requirements.md` with the approved
  statements without changing their meaning.
- [ ] Map each approved item to current evidence, design sections and one or
  more executable tasks.
- [ ] Record version/date/owner of the approved source in `requirements.md`.

Files: `specs/velopos-migration/requirements.md`.
Dependencies: none.
Links: requirements source gap, `BASE-F-001..008`.
Acceptance: all 92 rows have source-backed statements and no target row is
classified from inference.

Progress check: 2026-11-19 (Asia/Bangkok). T0.1 is BLOCKED because the approved
92-item register has not been supplied or found in the searched repository
documentation. A source-text search, including hidden files and excluding
dependencies, generated output, logs and credential files, found the migration
specifications, three restaurant setup/storefront plans and a historical
verification report. Those documents do not supply the complete approved
register. All 92 placeholders remain UNVERIFIED. No implementation or application
tests ran during this check. To unblock, the product authority must provide the
register or its repository path, with approval provenance and source version.

### T0.2 Resolve product decisions

- [ ] Confirm one-restaurant-per-organization and retained branch semantics.
- [ ] Confirm payment methods, provider authority, manual confirmation,
  refunds, fees, tax and marketplace commission policy.
- [ ] Confirm menu-only versus stock/recipe behavior for MVP.
- [ ] Confirm FIFO scope, queue periods, numbering and recovery semantics.
- [ ] Confirm role/capability model and owner-only transition.
- [ ] Confirm marketplace definition and whether cross-restaurant basket or
  delivery is in scope.

Files: `specs/velopos-migration/requirements.md`, `design.md`.
Dependencies: `T0.1`.
Links: `BASE-F-003..006`, `VP-UNVERIFIED-001..092`.
Acceptance: every open architecture decision in `design.md` has an approved
answer or is explicitly removed from MVP.

### T0.3 Freeze the compatibility baseline

- [ ] Capture current HEAD, clean/dirty state, schema readiness version, route
  inventory count, test commands and known historical limitations.
- [ ] Confirm no task-owned source changes are mixed with the migration work.
- [ ] Create a migration decision record for any route or table retained for
  compatibility.

Files: `docs/architecture/`, `packages/contracts/`, `database/`, optional
approved project handoff location.
Dependencies: `T0.1`, `T0.2`.
Links: `BASE-F-001`, `BASE-F-007`, design sections 2, 4 and 5.
Acceptance: baseline evidence is current, reproducible and does not rely only
on historical reports.

## 4. Phase 1 - domain and contract foundations

### T1.1 Define restaurant aggregates and state machines

- [ ] Define the restaurant profile/menu/order/payment/queue/receipt aggregate
  ownership using the approved requirements.
- [ ] Define allowed order, payment, queue, fulfillment, refund and
  reconciliation transitions with revision rules.
- [ ] Define immutable snapshots and terminal/exception states.
- [ ] Document lock order and transaction boundaries.

Files: `apps/api/internal/modules/restaurant/`,
`apps/api/internal/modules/storefront/`, `apps/api/internal/modules/pos/`,
`docs/architecture/`, new design decision record if required.
Dependencies: `T0.1`, `T0.2`.
Links: design sections 2, 7, 8 and 9; `BASE-F-004..005`,
`BASE-NFR-002..005`.
Acceptance: transition table covers success, invalid state, stale revision,
foreign tenant, replay and partial failure cases.

### T1.2 Design versioned public API contracts

- [ ] Define endpoint names, request/response schemas, error codes, status
  codes, pagination and idempotency headers.
- [ ] Decide whether to extend `online_orders` contracts or add restaurant
  endpoints; document compatibility aliases if needed.
- [ ] Update contract tests before implementation.

Files: `packages/contracts/openapi.yaml`, `packages/contracts/routes.json`,
`apps/api/internal/transport/`, `apps/web/src/lib/`.
Dependencies: `T1.1`.
Links: design section 4; `BASE-F-008`, `VP-UNVERIFIED-020..035`.
Acceptance: contract checker can identify every producer, consumer and route;
no route is removed without a compatibility decision.

### T1.3 Define authorization matrix

- [ ] Map approved roles/capabilities to setup, menu, orders, payment, queue,
  refunds, receipts and marketplace operations.
- [ ] Define organization and branch context behavior for new restaurant and
  retained retail records.
- [ ] Define denial, stale context and revoked membership behavior.

Files: `apps/api/internal/modules/organization/`,
`apps/web/src/app/access.ts`, `apps/web/src/app/ProtectedRoute.tsx`,
`docs/security/security-model.md`.
Dependencies: `T0.2`, `T1.1`.
Links: design section 6; `BASE-F-003`, `BASE-NFR-001`,
`VP-UNVERIFIED-056..065`.
Acceptance: matrix has positive and negative cases for every protected command
and query; frontend-only permission checks are rejected as sufficient.

## 5. Phase 2 - safe database migration

### T2.1 Choose schema compatibility strategy

- [ ] Compare organization-native restaurant tables with compatibility branch
  projection using real schema dependencies and retained-data examples.
- [ ] Select the strategy approved in `design.md` and record rejected trade-offs.
- [ ] Define backfill policy, nullability, indexes, RLS, foreign keys and
  uniqueness constraints.

Files: `database/migrations/`, `docs/database/`,
`apps/api/internal/platform/database/`.
Dependencies: `T0.1`, `T0.2`, `T1.1`.
Links: design section 5; `BASE-F-001`, `BASE-F-007`, `BASE-NFR-008`.
Acceptance: schema review proves no destructive rewrite, ambiguous legacy row
reclassification or unbounded lock is required.

### T2.2 Add forward migration(s)

- [ ] Add the next migration version(s); never edit 000001-000039.
- [ ] Add transaction-safe tables/columns for approved restaurant order,
  payment, queue, fulfillment, receipt and reconciliation behavior.
- [ ] Add RLS/policies, composite tenant keys, checks, indexes and audit links.
- [ ] Add migration-level tests for version, dirty state and populated rollback
  refusal/forward recovery.

Files: `database/migrations/000040_*.up.sql`, matching tests under
`apps/api/internal/platform/database/`; down migration only where safe and
explicitly supported.
Dependencies: `T2.1`.
Links: design section 5; `BASE-NFR-001`, `BASE-NFR-003`, `BASE-NFR-008`.
Acceptance: fresh schema and retained schema 39 upgrade both pass on an
isolated disposable PostgreSQL target; business data counts and hashes remain
unchanged except for approved additive records.

### T2.3 Implement migration rollback and recovery evidence

- [ ] Test empty-database down/reapply only for task-owned disposable targets.
- [ ] Verify populated rollback refuses safely when reversal would lose
  business data.
- [ ] Document forward recovery for dirty/partial application and operational
  ownership of the repair.

Files: `database/migrations/`, migration tests, `scripts/check-*`,
`docs/database/`.
Dependencies: `T2.2`.
Links: `BASE-F-007`, `BASE-NFR-005`, `BASE-NFR-008`, design section 5.3.
Acceptance: recovery and rollback outputs are captured; no primary or retained
database is touched.

## 6. Phase 3 - restaurant MVP backend

### T3.1 Implement organization-scoped setup and menu compatibility

- [ ] Complete profile, service modes, tables/QR, menu, payment and order
  readiness commands according to the approved state model.
- [ ] Preserve current setup idempotency and revision behavior.
- [ ] Keep legacy branch-linked restaurant records readable and isolated.
- [ ] Add server-side validation, authorization and audit events.

Files: `apps/api/internal/modules/restaurant/`,
`apps/api/internal/modules/organization/`, `apps/api/internal/modules/storefront/`.
Dependencies: `T1.1`, `T1.3`, `T2.2`.
Links: `AUD-F-016`, design sections 2, 5 and 6, approved setup requirements.
Acceptance: setup replay, stale revision, foreign tenant, incomplete setup and
concurrent owner cases pass.

### T3.2 Implement restaurant order and quote lifecycle

- [ ] Create durable order and immutable item/price/fee/fulfillment snapshots.
- [ ] Add order revisions and explicit event history.
- [ ] Ensure guest tracking tokens are scoped and not exposed in employee data.
- [ ] Preserve or version existing storefront order behavior during cutover.

Files: `apps/api/internal/modules/storefront/`,
`apps/api/internal/modules/restaurant/`, `packages/contracts/`.
Dependencies: `T1.1`, `T1.2`, `T2.2`, `T3.1`.
Links: `AUD-F-012..013`, design section 7, `BASE-F-004`, `BASE-NFR-002`.
Acceptance: duplicate submit, quote revision conflict, empty/invalid order,
private tracking and cross-tenant access cases pass.

### T3.3 Implement approved payment and reconciliation path

- [ ] Implement the approved manual/provider payment state machine.
- [ ] Persist idempotency key and fingerprint; replay identical requests safely.
- [ ] Verify provider callbacks/events when provider-backed behavior is in scope.
- [ ] Create durable reconciliation cases for unknown or contradictory
  outcomes.
- [ ] Prevent duplicate payment, sale, receipt, stock/hold and refund effects.

Files: `apps/api/internal/modules/storefront/payment_*.go`,
`apps/api/internal/modules/pos/` only where shared posting is required,
`apps/api/internal/modules/returns/`, new migration tests.
Dependencies: `T1.1`, `T1.2`, `T2.2`, `T3.2`.
Links: `AUD-F-015`, design section 9, `BASE-F-004`, `BASE-NFR-002`,
`BASE-NFR-005`.
Acceptance: success, duplicate replay, timeout, provider mismatch, manual
confirmation denial, refund conflict and partial transaction rollback pass.

### T3.4 Implement strict FIFO kitchen queue

- [ ] Define queue scope/period and allocate a persisted unique sequence.
- [ ] Enforce paid/reconciliation eligibility in the server query and command.
- [ ] Implement state transitions with optimistic revision and deterministic
  lock order.
- [ ] Add recovery command for explicitly audited queue exceptions.
- [ ] Keep queue output limited to authorized operational data.

Files: `apps/api/internal/modules/restaurant/queue.go`, queue domain/service
files, queue migrations/tests, `apps/api/internal/modules/storefront/orders.go`.
Dependencies: `T3.2`, `T3.3`, `T2.2`.
Links: `AUD-F-017..018`, design section 8, `BASE-F-005`, `BASE-NFR-003..004`.
Acceptance: concurrent arrivals preserve sequence; unpaid, refunded,
reconciliation-blocked and duplicate orders never enter; transitions cannot
skip/duplicate/reorder work; all changes are audited.

### T3.5 Implement fulfillment, receipt and history posting

- [ ] Define whether settlement reuses existing sales/receipts or adds a
  restaurant-native posting adapter.
- [ ] Commit approved payment, order event, receipt/sale and audit effects in
  one transaction where required.
- [ ] Preserve immutable historical retail records and safe reprint/history
  access.

Files: `apps/api/internal/modules/pos/`, `storefront/`, `returns/`,
`restaurant/`, `database/migrations/`.
Dependencies: `T3.3`, `T3.4`, `T1.3`.
Links: design sections 7 and 9, `BASE-F-001`, `BASE-F-004`,
`VP-UNVERIFIED-066..078`.
Acceptance: successful fulfillment, duplicate retry, posting conflict,
reconciliation recovery, refund exclusion and immutable history cases pass.

## 7. Phase 4 - frontend MVP and cutover

### T4.1 Implement setup/menu UI

- [ ] Reuse current `OrganizationProvider`, layouts, API clients, query
  feedback and design tokens.
- [ ] Remove only user-facing prerequisites proven obsolete by approved design;
  do not delete legacy routes or data paths prematurely.
- [ ] Add loading, empty, validation, denied, stale revision and recovery UI.

Files: `apps/web/src/features/organization/`,
`apps/web/src/features/restaurant/`, `apps/web/src/app/router.tsx`,
`apps/web/src/app/routes.ts`, related API clients/tests.
Dependencies: `T1.2`, `T1.3`, `T3.1`.
Links: design section 3, `BASE-F-003`, `BASE-NFR-006`.
Acceptance: setup can be completed at desktop and 360/390px widths with
keyboard access, no overflow and safe retry behavior.

### T4.2 Implement customer marketplace/order UI

- [ ] Reuse `StorefrontLayout`, directory, catalog, cart and tracking screens.
- [ ] Add only approved restaurant selection, quote, order and tracking states.
- [ ] Keep private tracking and employee views separated.
- [ ] Make payment/reconciliation outcomes explicit to customers and staff.

Files: `apps/web/src/features/storefront/`, `apps/web/src/layouts/StorefrontLayout.tsx`,
`apps/web/src/lib/storefront-api.ts`, `payment-sandbox-api.ts`, tests.
Dependencies: `T1.2`, `T3.2`, `T3.3`.
Links: `AUD-F-012..015`, design sections 3, 4, 7 and 9.
Acceptance: directory empty state, catalog, quote conflict, order success,
duplicate submission, payment pending/failure/recovery and private tracking
are covered at desktop/mobile widths.

### T4.3 Implement operations, queue and fulfillment UI

- [ ] Replace or extend `/orders` and `/kitchen` without bypassing server
  eligibility checks.
- [ ] Display queue sequence, payment state, fulfillment state, stale revision
  and reconciliation blockers accurately.
- [ ] Provide operator recovery actions only for authorized roles.

Files: `apps/web/src/features/restaurant/`,
`apps/web/src/features/storefront/OnlineOrderPages.tsx`,
`apps/web/src/app/router.tsx`, tests/e2e.
Dependencies: `T3.3`, `T3.4`, `T3.5`, `T1.3`.
Links: design sections 3, 7, 8 and 9, `BASE-NFR-004`, `BASE-NFR-006`.
Acceptance: paid-before-kitchen, FIFO display, transition denial, recovery,
empty queue, API failure and long-content cases pass in browser tests.

### T4.4 Reconcile navigation and route inventory

- [ ] Compare `routes.json`, current React routes and Go registrations.
- [ ] Mark each route as active, compatibility alias, planned, deprecated or
  obsolete based on approved requirements.
- [ ] Update navigation and direct-link denial tests without deleting retained
  backend compatibility prematurely.

Files: `packages/contracts/routes.json`, `packages/contracts/openapi.yaml`,
`apps/web/src/app/`, `apps/api/internal/transport/`, route tests.
Dependencies: `T1.2`, `T4.1`, `T4.2`, `T4.3`.
Links: `AUD-F-003`, `AUD-F-022`, design sections 3 and 4.
Acceptance: route inventory has no unexplained mismatch and direct URLs obey
server authorization.

## 8. Phase 5 - verification and compatibility release gate

### T5.1 Unit and contract verification

- [ ] Run focused Go tests for restaurant, storefront, payment, queue,
  organization and shared posting.
- [ ] Run focused web tests for setup, ordering, payment, queue, routing and
  recovery.
- [ ] Run `npm run contracts:check` and inspect route/OpenAPI consistency.
- [ ] Run formatting/type/lint/build checks for affected workspaces.

Files: existing test paths plus new tests beside changed modules.
Dependencies: all T3/T4 implementation tasks.
Links: design sections 4, 6, 8, 9 and 11.
Acceptance: all affected checks pass on current inputs; failures are fixed or
reported, never ignored as historical without reproduction evidence.

### T5.2 Database and migration acceptance

- [ ] Run fresh migration and retained schema 39 upgrade on task-owned
  disposable PostgreSQL only.
- [ ] Run RLS/FK/check/index, tenant isolation, replay, concurrency,
  transaction rollback and forward-recovery checks.
- [ ] Verify no primary/retained database or business data was modified.

Files: `database/migrations/`, `apps/api/internal/platform/database/`,
`tests/integration/`, existing verification scripts.
Dependencies: `T2.2`, `T2.3`, `T3.3`, `T3.4`, `T3.5`.
Links: `BASE-NFR-001..005`, `BASE-NFR-008`, design section 5.
Acceptance: fresh, retained, negative-authorization and failure-path evidence
is current and captured.

### T5.3 Browser and responsive acceptance

- [ ] Run setup -> menu -> customer order -> payment -> queue -> fulfillment
  flows against the approved local environment.
- [ ] Check 360px, 390px and 1280px widths, keyboard focus, touch targets,
  wrapping, loading, empty, error and recovery states.
- [ ] Record any real-device-only behavior separately; do not claim it from
  desktop emulation alone.

Files: `tests/e2e/`, `playwright.config.ts`, affected frontend features.
Dependencies: `T4.1`, `T4.2`, `T4.3`.
Links: `BASE-NFR-006`, design section 3 and 11.
Acceptance: primary flow and negative/recovery browser scenarios pass with
current evidence and no horizontal overflow.

### T5.4 Independent security and correctness review

- [ ] Dispatch an independent reviewer for authorization, tenant isolation,
  secrets, payment idempotency, data integrity, FIFO concurrency and migration
  safety.
- [ ] Provide the reviewer the scoped diff, contracts and matching fresh test
  evidence without secrets or unrelated files.
- [ ] Reconcile findings against current source and add focused reproductions
  before applying fixes.
- [ ] Repeat review for changed security/high-risk paths.

Files: changed auth/organization/payment/database/queue paths and evidence.
Dependencies: `T5.1`, `T5.2`, `T5.3`.
Links: `BASE-F-003..007`, `BASE-NFR-001..005`, design sections 6, 8, 9 and 10.
Acceptance: reviewer returns no unresolved release-blocking findings; all
remaining risks have owners and explicit approval.

### T5.5 Compatibility cutover decision

- [ ] Compare MVP behavior with every approved requirement and acceptance
  criterion.
- [ ] Decide whether to keep dual paths, enable restaurant flow for selected
  organizations, or pause for more work.
- [ ] Define rollback to the prior route/feature flag behavior without data
  deletion.
- [ ] Obtain explicit authorization before any remote push, deployment or
  retained/production migration.

Files: `docs/architecture/`, release/runbook location approved by the project,
feature flag/configuration files only if separately authorized.
Dependencies: `T5.1`, `T5.2`, `T5.3`, `T5.4`.
Links: all approved requirements; design section 12; `BASE-NFR-010`.
Acceptance: release decision is evidence-backed and includes target, version,
impact, rollback path and explicit approval status.

## 9. Post-MVP advanced work

### T6.1 Marketplace expansion

- [ ] Implement only approved multi-restaurant basket, commissions, delivery,
  customer accounts and marketplace settlement semantics.
- [ ] Extend tenant and privacy tests for cross-store behavior.
- [ ] Add reconciliation and operational reporting for marketplace effects.

Dependencies: `T5.5`, approved marketplace requirements.
Links: `VP-UNVERIFIED-*` after mapping, design sections 3, 7 and 9.
Acceptance: approved marketplace contract and settlement tests pass without
weakening single-restaurant isolation.

### T6.2 AI advisory features

- [ ] Define typed snapshot inputs, model/version provenance, insufficient-data
  behavior, timeout and outage isolation.
- [ ] Add Go-to-AI client behind server boundary; keep no browser direct call.
- [ ] Present recommendations as advisory and require human authorization for
  any stock/purchase/payment action.

Dependencies: `T5.5`, approved AI requirements, production observability.
Files: `apps/api/internal/`, `apps/ai/`, `apps/web/src/features/`.
Links: `BASE-F-006`, design section 10, approved AI requirements.
Acceptance: AI outage does not block checkout/order settlement and no AI path
can mutate stock, payments or retail records autonomously.

### T6.3 Production hardening

- [ ] Define and measure latency/concurrency budgets.
- [ ] Complete least-privilege deployment credentials, backup/restore drills,
  retention, monitoring, alerting, load, accessibility and failover checks.
- [ ] Certify real payment providers, tax and hardware only if approved.

Dependencies: `T5.5`, approved non-functional requirements.
Links: `BASE-NFR-007..010`, design section 11.
Acceptance: production readiness review passes with current evidence and a
documented rollback/runbook owner.

## 10. Task dependency summary

```text
T0.1 -> T0.2 -> T0.3
          |
          +-> T1.1 -> T1.2 -> T1.3
                    |
                    +-> T2.1 -> T2.2 -> T2.3
                                  |
                                  +-> T3.1 -> T3.2 -> T3.3 -> T3.4 -> T3.5
                                                  |       |       |
                                                  +-------+-------+
                                                          |
                                             T4.1 -> T4.2 -> T4.3 -> T4.4
                                                          |
                                     T5.1 -> T5.2 -> T5.3 -> T5.4 -> T5.5
                                                                    |
                                                               T6 advanced
```

## 11. File disposition policy

### Create

- `specs/velopos-migration/requirements.md`
- `specs/velopos-migration/design.md`
- `specs/velopos-migration/tasks.md`
- Future additive migration files only after approved schema design.
- Future tests beside owning modules and existing integration/e2e seams.

### Modify only after approved requirements

- `apps/api/internal/modules/restaurant/`, `storefront/`, `organization/`,
  `pos/`, `returns/` and `transport/`.
- `apps/web/src/features/restaurant/`, `storefront/`, `organization/`,
  `app/`, `layouts/` and `lib/`.
- `packages/contracts/openapi.yaml` and `routes.json`.
- Architecture/database/security documentation and release runbooks.

### Preserve until acceptance

- Existing migrations 000001-000039.
- Retail catalog, inventory, POS, purchasing, returns, pricing, customer,
  loyalty and quality modules.
- Historical branches, memberships, sales, payments, refunds, stock movements,
  receipts and audit records.
- Compatibility routes and callers that still serve retained data.

### Deprecate only after explicit evidence

- Duplicate or superseded restaurant setup/order/payment routes.
- Owner-retired staff/employee UI paths and route inventory entries.
- Retail prerequisites that the approved restaurant flow demonstrably no longer
  needs.

## 12. Current stop condition

No task is complete; T0.1 is blocked and all other work remains pending.
Implementation must not begin until:

1. the full approved 92-item source is supplied and mapped;
2. product decisions in `requirements.md` are resolved;
3. this design and task ordering are reviewed;
4. implementation scope and required independent review are authorized.
