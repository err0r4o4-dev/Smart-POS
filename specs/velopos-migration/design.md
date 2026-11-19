# VELOPOS Migration Design

Status: PROVISIONAL - depends on approved requirements register
Design date: 2026-11-19 (Asia/Bangkok)
Precondition: `specs/velopos-migration/requirements.md`

## 1. Design stance

This design migrates the existing SmartPOS modular monolith incrementally. It
does not propose a rewrite, a new framework, a second database, or immediate
retirement of retail data. It preserves the current browser -> Caddy -> Go API
-> PostgreSQL boundary and keeps the FastAPI service behind a server-side
advisory boundary.

The design is provisional because the 92 approved VELOPOS requirements are not
present. Every target-facing decision links to the audit baseline and to one or
more `VP-UNVERIFIED-*` placeholders. No placeholder is treated as approval.

Decision status:

- `DRAFT`: safe architectural direction supported by current repository
  constraints.
- `BLOCKED`: requires a product or requirements decision before implementation.
- `COMPATIBILITY`: preserves existing behavior while the new path is proven.

## 2. Target architecture

### 2.1 Boundary diagram

```text
Customer browser / owner browser / restaurant staff browser
                         |
                    Caddy gateway
                         |
                 Go /api/v1 modular monolith
     +-------------------+--------------------+
     |                   |                    |
  Identity          Organization        Restaurant/Storefront
     |                   |                    |
     +------------ shared authorization -----+
                         |
                 PostgreSQL 17
                         |
        transactional records, audit, outbox/recovery evidence

Go server -> internal FastAPI AI service (optional, advisory, no DB access)
```

### 2.2 Module boundaries

Retain the existing modules and add restaurant-specific orchestration only
where ownership is clear:

| Target capability | Owning module | Reuse/current path | Design rule |
| --- | --- | --- | --- |
| Identity/session | `identity` | `apps/api/internal/modules/identity/` | Do not duplicate login or session authority. |
| Tenant and roles | `organization` | `organization/policy.go`, `members.go` | Every command resolves org and role server-side. |
| Restaurant profile/setup/menu | `restaurant` | `restaurant/organization_setup.go`, `organization_menu.go` | New restaurant state is organization-scoped only if approved; retain branch joins for legacy rows. |
| Public directory/catalog/order | `storefront` | `storefront/catalog_browse.go`, `orders.go` | Keep public data separate from employee data and tracking tokens. |
| Restaurant payment/settlement | New bounded service in `restaurant` or `storefront`, with shared financial posting seam | Existing `pos`, `storefront/payment_*`, `returns` | Do not fork money rules; reuse shared transaction and idempotency primitives. |
| Kitchen queue | `restaurant` | `restaurant/queue.go`, queue migrations | Queue eligibility and FIFO ordering are server-owned invariants. |
| Legacy retail | `catalog`, `inventory`, `pos`, `purchasing`, `returns`, `pricing`, `customers`, `loyalty`, `quality` | Existing modules | Preserve API/data until replacement acceptance; deprecate only after dual-path evidence. |
| AI advisory | `apps/ai` plus a future typed Go client | `apps/ai/app/main.py` health-only service | No browser direct call, DB credentials, or autonomous mutation. |

Relevant requirements: `BASE-F-001`, `BASE-F-002`, `BASE-F-003`, `BASE-F-004`,
`BASE-F-006`, `VP-UNVERIFIED-001..092`.

## 3. Frontend architecture and navigation

### 3.1 Preserve the current shell

Keep Vite, React Router, TanStack Query, existing layouts, Lucide, Thai/Latin
font setup, and runtime tokens. The current ownership points are
`apps/web/src/app/router.tsx`, `routes.ts`, `OrganizationProvider`,
`RequireSession`, `OrganizationGate`, `ManagementLayout`, and
`StorefrontLayout`.

Do not create a second router or duplicate API client. Add new screens under
the owning feature and expose them through existing route/page lazy-loading
patterns.

### 3.2 Proposed navigation flows

The following flows are target proposals and remain `BLOCKED` until the
requirements register confirms their exact scope.

1. **Account and restaurant setup**
   - `/register` -> email verification/recovery -> `/setup`
   - organization selection/context -> restaurant profile -> service modes ->
     tables/QR -> menu -> payment settings -> order readiness
   - completion redirects to the restaurant management home.
2. **Customer marketplace**
   - `/shop` directory -> `/:slug` restaurant page -> menu/category search ->
     cart -> quote -> order confirmation -> private tracking.
   - Multi-store basket, customer account, delivery and commissions are
     intentionally not assumed.
3. **Restaurant operations**
   - management home -> incoming orders -> payment confirmation or provider
     callback -> kitchen queue -> ready/fulfillment -> receipt/history.
4. **Legacy retail compatibility**
   - existing `/pos`, inventory, purchasing and returns routes remain available
     behind their current permissions while the restaurant path is proven.
   - New navigation must not silently route restaurant users into a retail
     terminal/shift prerequisite.

### 3.3 UI state and responsive acceptance

Each new or changed flow must include loading, empty, error and recovery states;
stale revision and payment reconciliation states must be actionable without
data loss. Check 360px, 390px and 1280px widths plus keyboard focus, long Thai
labels, touch targets and no horizontal overflow.

Relevant requirements: `BASE-NFR-006`, `BASE-F-003`, `VP-UNVERIFIED-010`,
`VP-UNVERIFIED-011`, `VP-UNVERIFIED-012` (placeholder links only).

## 4. Backend and API design

### 4.1 Command/query separation

Follow the existing handler/service/domain style rather than introducing a new
framework. Public handlers should decode and validate requests, resolve user
and organization context, call a domain/application service, and map stable
errors to the existing envelope. SQL writes remain inside the owning service
transaction.

New restaurant commands should be explicit and idempotent, for example:

- setup profile/services/tables/menu/payment/order readiness;
- create order and obtain an immutable quote;
- confirm or observe payment;
- transition eligible order into queue;
- advance queue item through approved fulfillment states;
- issue approved refund/reconciliation action;
- reprint or retrieve receipt/history.

Names and payloads are intentionally not final until the approved contract is
available. Avoid adding guessed routes to `openapi.yaml`.

### 4.2 Contract synchronization

For each endpoint change, update and validate all of:

1. Go route registration and handler behavior.
2. Request/response types and error/status mapping.
3. `packages/contracts/openapi.yaml`.
4. `packages/contracts/routes.json`.
5. Frontend API client/query keys and affected UI.
6. Unit, integration and browser coverage.

The contract checker is `scripts/check-contracts.mjs`. Existing route inventory
and current runtime routes must be reconciled before removing or renaming a
route.

Relevant requirements: `BASE-F-008`, `BASE-F-003`, `VP-UNVERIFIED-020..035`.

## 5. Database design and migration strategy

### 5.1 Compatibility model

Use additive forward migrations after schema 39. Do not edit migrations
000001-000039. Preserve all existing retail foreign keys, branch references,
payment evidence, stock movements, sales, receipts, audit records and open
transactions.

For a branchless restaurant path, prefer one of these designs, to be selected
after requirements confirmation:

- **Option A - organization-native restaurant tables (recommended):** new
  restaurant profile/menu/order/payment/queue tables reference `organization_id`
  directly; legacy branch links remain nullable/required only where old rows
  need them.
- **Option B - compatibility branch projection:** create an internal projection
  that represents the restaurant organization without exposing a hidden branch
  as a user-facing prerequisite. This is lower churn but increases semantic
  ambiguity and migration complexity.

Option A is recommended because migrations 37-39 already introduce
organization-scoped restaurant profiles, dining tables, menus and storefront
draft concepts. It must not be implemented until the approved requirements
confirm branch semantics.

### 5.2 Proposed target data groups

Add only the tables required by approved behavior, likely grouped as:

- `restaurant_orders` and immutable `restaurant_order_items` snapshots;
- `restaurant_order_events` with actor, state, revision and request identity;
- `restaurant_payment_attempts`/observations or a shared payment ledger seam;
- `restaurant_fulfillment_queue` with persisted sequence/period identity;
- `restaurant_receipts` or a compatibility link to existing receipts;
- `restaurant_reconciliation_cases` when external payment outcome is unknown.

Names are provisional. Reuse existing `online_orders` only if its invariants,
status model, tenant scope and retained-data compatibility satisfy the approved
requirements without forcing restaurant operations through retail POS state.

### 5.3 Migration and rollback gates

Every migration slice requires:

1. Fresh database apply through the new version.
2. Retained-data upgrade from schema 39 with representative legacy rows.
3. RLS/FK/check/index validation and exact version readiness.
4. Forward recovery for populated data; no destructive down migration when
   business data exists.
5. Re-run/idempotency/concurrency tests against a disposable task-owned
   PostgreSQL target.
6. Documentation of data impact, lock behavior, and rollback alternative.

Relevant requirements: `BASE-F-001`, `BASE-F-004`, `BASE-F-007`,
`BASE-NFR-001`, `BASE-NFR-003`, `BASE-NFR-008`, `VP-UNVERIFIED-036..055`.

## 6. Authentication, RBAC and tenant isolation

### 6.1 Authentication

Reuse server-managed sessions and existing identity flows. Keep password hashes,
recovery tokens, external identity state and audit payloads out of frontend
bundles and logs. Do not expose internal AI or PostgreSQL credentials to the
browser.

### 6.2 Authorization

Use `organization` as the authority for active membership, role, organization
status and branch context. The frontend may hide routes, but every API query
and command must recheck authorization. Restaurant permissions should be
capability-based and separate from legacy retail permissions, for example:

- restaurant setup/profile/menu management;
- restaurant order read/write;
- payment confirmation/refund/reconciliation;
- kitchen queue read/transition;
- receipt/history read;
- owner-only administration.

Exact roles and capability names are blocked pending the approved requirements.

### 6.3 Tenant isolation

Use organization-scoped SQL predicates and existing transaction context/RLS.
When organization or branch changes, invalidate query caches and cancel stale
requests as existing providers do. Test foreign-tenant reads/writes,
membership removal, stale context, direct URL access, and single-store mode.

Relevant requirements: `BASE-F-003`, `BASE-NFR-001`, `VP-UNVERIFIED-056..065`.

## 7. Order, payment and fulfillment lifecycle

The exact state names are provisional. The lifecycle must preserve immutable
snapshots and make each transition explicit:

```text
DRAFT/QUOTED
   -> SUBMITTED
   -> PAYMENT_PENDING
   -> PAID
   -> QUEUED
   -> PREPARING
   -> READY
   -> FULFILLED
   -> COMPLETED
```

Terminal or exception paths:

```text
SUBMITTED/PAYMENT_PENDING -> CANCELLED
PAID/QUEUED/PREPARING     -> REFUND_REVIEW or REFUNDED (policy-dependent)
PAID                      -> FULFILLMENT_REVIEW when external evidence conflicts
```

Rules for the target design:

- A quote freezes item, price, fee, tax and fulfillment snapshots for its
  revision.
- An order transition checks organization scope, current revision and allowed
  predecessor state.
- Payment outcome is represented as durable evidence, not inferred from a
  client redirect.
- Kitchen eligibility requires the approved paid predicate and must exclude
  unreconciled refund/fulfillment review states.
- Fulfillment and financial posting are atomic where the approved business
  rule requires them; unknown external outcomes become reconciliation cases,
  not silent retries.
- Legacy pickup flows remain compatible until the new path passes acceptance.

Relevant requirements: `BASE-F-004`, `BASE-F-005`, `BASE-NFR-002`,
`BASE-NFR-003`, `BASE-NFR-005`, `VP-UNVERIFIED-066..078`.

## 8. Strict FIFO queue invariants

FIFO is a server/database invariant, not a screen sort. The queue design must
define a restaurant/service-period scope and persist an immutable sequence.

Required invariants:

1. Every eligible order receives exactly one queue identity for the applicable
   restaurant and service period.
2. Queue sequence allocation is serialized per scope; no duplicate sequence is
   possible under concurrent payment/order confirmation.
3. Eligibility is evaluated from persisted order/payment/reconciliation state,
   not client-supplied status.
4. Queue reads order by persisted sequence, then a stable unique tie-breaker;
   client timestamps alone are insufficient.
5. A queue item cannot be skipped, duplicated, or re-entered after a terminal
   state without an explicit audited recovery command.
6. State transitions use optimistic revision checks and a transaction lock
   order documented in the design and tested under concurrency.
7. Queue screens never expose private customer/payment tokens beyond the
   minimum required for the operator role.
8. Period rollover and reopening rules are explicit and tested.

Current evidence is `restaurant_queue_periods`, `restaurant_order_queue`,
`restaurant/queue.go`, and queue integration/schema tests. Their exact
eligibility semantics must be reconciled with the new restaurant lifecycle.

Relevant requirements: `BASE-NFR-004`, `BASE-F-005`, `VP-UNVERIFIED-079..084`.

## 9. Payment idempotency and reconciliation

Use a stable request idempotency key plus a normalized request fingerprint.
Store the first outcome and return it on an identical replay. Reuse existing
patterns in POS and restaurant setup rather than creating a second idempotency
implementation.

For provider-backed payment:

1. Create an internal payment attempt before redirect/provider submission.
2. Correlate provider callbacks through a verified provider/event identity.
3. Record raw outcome metadata safely without secret/token payloads.
4. Apply payment state and business effects in one local transaction when the
   provider outcome is authoritative.
5. Place unknown, contradictory, or timeout outcomes in reconciliation state.
6. Retry only replay-safe observations or approved reconciliation commands.
7. Prevent payment, sale, receipt, stock hold and refund double posting.

For manual cash or operator-confirmed payment, require an authenticated role,
amount/revision checks, audit event and explicit evidence. Do not represent a
client-side button click as provider confirmation.

Relevant requirements: `BASE-F-004`, `BASE-NFR-002`, `BASE-NFR-005`,
`VP-UNVERIFIED-066..078`.

## 10. Security and privacy architecture

- Keep public storefront responses separate from employee data and tracking
  token storage.
- Apply origin/CSRF/session protections using existing identity and gateway
  conventions.
- Validate all IDs, money, quantities, status transitions, revision numbers and
  idempotency keys at the API boundary.
- Avoid logging passwords, secret keys, provider tokens, tracking tokens or
  payment payloads; preserve request IDs for safe correlation.
- Use least-privilege runtime DB credentials separate from migration access in
  deployed environments.
- Keep AI service access internal and typed; no public AI route or AI mutation
  authority.
- Treat customer PII, addresses, phone numbers and order tracking as scoped
  data with an explicit retention policy before production.

Relevant requirements: `BASE-F-003`, `BASE-F-006`, `BASE-NFR-001`,
`BASE-NFR-007`, `VP-UNVERIFIED-056..065`, `VP-UNVERIFIED-085..092`.

## 11. Testing and deployment architecture

### 11.1 Test layers

1. Go domain/service tests for validation, transition matrices, authorization,
   idempotency and failure paths.
2. Go/API contract tests for status codes, error envelopes, tenant scope and
   route compatibility.
3. Disposable PostgreSQL migration/integration tests for RLS, constraints,
   transactions, races and retained legacy data.
4. React/Vitest tests for query keys, state rendering, permissions and recovery.
5. Playwright flows for setup, directory, order, payment, queue and responsive
   behavior at representative desktop/mobile widths.
6. AI service tests only for its typed advisory contract and safe failure.

Use existing scripts from `package.json` and existing integration fixtures.
Do not introduce a second test framework or run migration checks against the
primary/retained database.

### 11.2 Deployment gates

No deployment is part of this planning task. Before any release:

- contract inventory and OpenAPI checks pass;
- API, web and AI builds/tests pass for the affected scope;
- fresh and retained-data migration checks pass on isolated targets;
- tenant, permission, replay, reconciliation, FIFO and rollback tests pass;
- responsive/browser evidence is current;
- release artifact, monitoring, backup/restore and rollback runbook are
  reviewed;
- production database and deployment authorization are separately confirmed.

Relevant requirements: `BASE-NFR-008`, `BASE-NFR-010`, `VP-UNVERIFIED-085..092`.

## 12. Architectural decisions and trade-offs

| Decision | Status | Rationale | Requirement links |
| --- | --- | --- | --- |
| Keep the modular Go monolith | DRAFT | Existing boundaries, contracts and transaction ownership are coherent; a rewrite increases migration risk. | `BASE-F-002`, `BASE-F-008`, `VP-UNVERIFIED-001..010` |
| Use organization-native restaurant records for new semantics when approved | DRAFT/blocked | Migrations 37-39 already establish organization-scoped profile/menu/draft concepts; it avoids user-facing hidden branch prerequisites. | `BASE-F-001`, `BASE-F-007`, `VP-UNVERIFIED-011..025` |
| Preserve branch-linked retail history | COMPATIBILITY | Existing sales, stock and authorization data depend on branches; deleting or rewriting it violates data preservation. | `BASE-F-001`, `BASE-F-003`, `VP-UNVERIFIED-026..035` |
| Reuse shared idempotency/transaction patterns | DRAFT | Duplicate payment/stock/settlement primitives would create inconsistent replay behavior. | `BASE-F-004`, `BASE-NFR-002`, `VP-UNVERIFIED-036..050` |
| Make queue FIFO persisted and database-enforced | DRAFT | UI sorting cannot provide concurrency or audit guarantees. | `BASE-F-005`, `BASE-NFR-004`, `VP-UNVERIFIED-051..065` |
| Keep AI advisory and internal | COMPATIBILITY | Existing AI service is health-only and repository policy prohibits autonomous financial/stock actions. | `BASE-F-006`, `VP-UNVERIFIED-066..075` |
| Migrate by dual-path compatibility before deprecation | DRAFT | Retail records and callers must remain valid until restaurant acceptance is proven. | `BASE-F-001`, `BASE-F-007`, `BASE-F-008`, `VP-UNVERIFIED-076..092` |

## 13. Open architecture decisions

The following are release-blocking decisions, not implementation details to
guess:

- Final approved requirements and mapping of all 92 IDs.
- Restaurant order/payment aggregate boundaries and whether to extend
  `online_orders` or introduce organization-native tables.
- Branch semantics for new restaurants and retained retail records.
- Payment methods, provider authority, manual confirmation policy, refund
  timing, fees, tax and commission model.
- Inventory/recipe behavior for restaurant MVP and when stock effects post.
- Exact FIFO scope, numbering, service periods and recovery operations.
- Roles/capabilities after owner-only transition.
- Marketplace definition and whether cross-restaurant basket/fulfillment is in
  scope.
- Production targets, observability, retention, backups, disaster recovery and
  deployment ownership.

Until these are resolved, the design is suitable for review and task ordering,
but not for implementation authorization.
