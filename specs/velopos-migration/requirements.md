# VELOPOS Migration Requirements Audit

Status: DRAFT - repository audit only
Audit date: 2026-11-19 (Asia/Bangkok)
Source project: SmartPOS repository at `feature/fix-system-`
Scope: Existing repository audit and migration planning; no implementation

## 1. Executive finding

The complete set of 92 approved VELOPOS requirements was not found in the
repository. The audit searched tracked source, `docs/`, `.superpowers/`,
`packages/contracts/`, `tests/`, `README.md`, `AGENTS.md`, and
`SESSION_HANDOFF.md`. The repository contains VELOPOS implementation slices,
historical plans, and business rules, but not an authoritative 92-item
requirements register with approved requirement statements.

Therefore:

- No target requirement statement is invented in this document.
- The 92 target identifiers below are placeholders marked `UNVERIFIED`.
- Current-state classifications are evidence-based observations, not proof
  that an approved VELOPOS requirement is satisfied.
- Design decisions and tasks are provisional until the approved register is
  supplied and mapped to these placeholders.

## 2. Audit boundary and evidence rules

This audit is read-only. Generated build output, logs, dependency caches,
virtual environments, local database dumps, and browser reports were excluded
from source-of-truth analysis. Existing data and applied migrations were not
modified.

Evidence precedence:

1. Current tracked code, contracts, migrations, and tests.
2. Current repository architecture and security documentation.
3. Current branch metadata and recent commit history.
4. Historical verification reports and handoff notes, clearly labeled as
   historical.

Status meanings:

- `Implemented`: behavior is present in current code and has a direct test or
  contract seam; this is not production certification.
- `Partial`: a slice exists but the end-to-end target behavior is incomplete,
  paused, or not accepted.
- `Missing`: no current implementation evidence was found.
- `Conflicting`: current behavior or data model conflicts with the intended
  restaurant-first direction or an explicit repository decision.
- `Obsolete`: inventory or documentation entry is not represented by current
  runtime ownership, or is explicitly retired by current direction.
- `UNVERIFIED`: the approved requirement statement or acceptance rule is
  missing, so target compliance cannot be assessed.

## 3. Repository and technology baseline

| Boundary | Current evidence | Audit conclusion |
| --- | --- | --- |
| Frontend | `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/app/router.tsx` | React 19, TypeScript 6, Vite 8, React Router 7, TanStack Query, Lucide, Tailwind 4, Vitest, Testing Library. |
| Public API | `apps/api/go.mod`, `apps/api/cmd/server/main.go`, `apps/api/internal/transport/router.go` | Go 1.26 modular monolith using Chi, pgx, OAuth/OIDC, x/crypto, and a single `/api/v1` boundary. |
| Database | `database/migrations/000001` through `000039`, `apps/api/internal/platform/database/database.go:12` | PostgreSQL 17 container; forward-only migration history; current readiness requires schema version 39 and a clean migration state. |
| Internal AI | `apps/ai/pyproject.toml`, `apps/ai/app/main.py:34` | FastAPI service is a health/error boundary only. No forecasting or autonomous business action is implemented. |
| Gateway/runtime | `docker-compose.yml`, `infra/caddy/Caddyfile` | Caddy fronts web and API; Docker Compose defines PostgreSQL, migrate, Go API, web, Mailpit, AI, and check profiles. |
| Contracts | `packages/contracts/openapi.yaml`, `packages/contracts/routes.json` | OpenAPI and route inventory exist, but route inventory includes 18 modules/115 routes and legacy/planned UI entries not all represented by the current React router. |
| Verification | `package.json`, `tests/integration/`, `tests/e2e/`, Go module tests, `docs/development/verification.md` | Unit, contract, integration, browser, migration, and safety seams exist; historical reports are not current acceptance evidence. |

## 4. Current repository inventory

### 4.1 Frontend

`apps/web/src/features/` contains authentication, catalog, customers,
dashboard, help, inventory, landing, loyalty, organization, POS, pricing,
purchasing, quality, restaurant, returns, storefront, system, and workspace
features. `apps/web/src/layouts/` separates login, management, role workspace,
and public storefront layouts. `apps/web/src/lib/` contains domain API clients
for catalog, inventory, POS, purchasing, returns, pricing, customers, loyalty,
organization, storefront, payments, and quality.

The current router is `apps/web/src/app/router.tsx`. It exposes `/shop`,
authenticated management routes, `/orders`, `/kitchen`, `/menu`, `/sales`,
`/receipts`, `/refunds`, `/pos`, `/setup`, and settings. Navigation is defined
in `apps/web/src/app/routes.ts:38` and still reflects a mixed POS/restaurant
workspace.

### 4.2 Backend modules

| Module | Current responsibility | Key paths |
| --- | --- | --- |
| `identity` | Registration, sessions, recovery, email/Google authentication, security and audit | `apps/api/internal/modules/identity/` |
| `organization` | Organizations, branches, memberships, owner policies, invitations, tenant authorization, single-store selection | `apps/api/internal/modules/organization/` |
| `catalog` | Products, variants, categories, brands, units, barcodes, import | `apps/api/internal/modules/catalog/` |
| `inventory` | Locations, movements, balances, documents, counts, transfers, quality | `apps/api/internal/modules/inventory/` |
| `pos` | Terminals, shifts, carts, checkout, sales, receipts, online-order handoff, prepaid settlement | `apps/api/internal/modules/pos/` |
| `purchasing` | Suppliers, purchase documents, receiving, returns, shelves, replenishment | `apps/api/internal/modules/purchasing/` |
| `pricing` | Price lists, promotions, quotes, discount approvals, rewards | `apps/api/internal/modules/pricing/` |
| `customers` | Customer records, groups, history, audit | `apps/api/internal/modules/customers/` |
| `loyalty` | Programs, accounts, ledger, redemption and adjustments | `apps/api/internal/modules/loyalty/` |
| `returns` | Returns, refunds, adjustments, exchanges, settlement/reconciliation | `apps/api/internal/modules/returns/` |
| `storefront` | Public store directory/catalog, guest orders, tracking, reservations, payment sandbox and online reconciliation | `apps/api/internal/modules/storefront/` |
| `restaurant` | Restaurant setup, profiles/menu/table setup, settings, recipes and queue | `apps/api/internal/modules/restaurant/` |

Composition is centralized in `apps/api/internal/transport/router.go:57-73`.
The public API is a modular monolith, not a set of separately deployed
services.

### 4.3 Database and data ownership

Migrations establish identity and tenant tables first, then catalog,
inventory, POS/sales, purchasing/shelves, business operations, pricing,
customers, loyalty, quality, storefront, online reservations/payment,
restaurant setup, and organization-scoped restaurant menu/draft tables.

Important current tables include:

- Tenant and identity: `organizations`, `branches`, `users`,
  `organization_memberships`, `branch_memberships`, sessions, invitations,
  audit tables.
- Retail operations: `products`, `product_variants`, `stock_locations`,
  `stock_balances`, `stock_movements`, `pos_terminals`, `register_shifts`,
  `pos_carts`, `sales`, `receipts`.
- Restaurant/storefront: `storefronts`, `online_orders`,
  `online_order_events`, `restaurant_settings`, `restaurant_tables`,
  `restaurant_recipes`, `restaurant_queue_periods`,
  `restaurant_order_queue`, `restaurant_profiles`,
  `restaurant_dining_zones`, `restaurant_dining_tables`,
  `restaurant_menu_categories`, `restaurant_menu_items`.
- Payment/reconciliation: `online_payment_attempts`, payment inbox/dispatch
  and observation tables, `online_payment_reconciliations`, refund intents and
  observations.

`database/migrations/000001_foundation.up.sql` and later migrations enable
RLS/policies for several tenant-owned table groups. The existing model retains
branch and stock relationships for historical retail records; it must not be
collapsed by deleting or rewriting data.

## 5. Current capability classification

The following matrix compares observed current behavior with the migration
direction described by the user. Because the approved statements are absent,
every target comparison remains `UNVERIFIED`.

| Audit ID | Capability | Current status | Evidence | VELOPOS target status |
| --- | --- | --- | --- | --- |
| `AUD-F-001` | Account registration, sessions and recovery | Implemented | `apps/api/internal/modules/identity/`, `apps/web/src/features/auth/`, auth tests | UNVERIFIED |
| `AUD-F-002` | Organization and branch tenancy | Implemented for current model | `apps/api/internal/modules/organization/`, migrations 1-3 | UNVERIFIED; branchless restaurant semantics are not approved in source |
| `AUD-F-003` | Owner-only management direction | Partial/conflicting | `docs/architecture/workspaces.md`, `apps/web/src/app/access.ts`, current route guards | UNVERIFIED; historical staff/role surfaces remain in contracts and code |
| `AUD-F-004` | Retail catalog and exact prices | Implemented | `apps/api/internal/modules/catalog/`, migration 4, catalog tests | UNVERIFIED; restaurant menu ownership is separate and incomplete |
| `AUD-F-005` | Retail inventory ledger and stock locations | Implemented | `apps/api/internal/modules/inventory/`, migration 5, ledger docs | UNVERIFIED; target may require menu-only restaurant operation |
| `AUD-F-006` | POS terminals, shifts, carts and checkout | Implemented for retail | `apps/api/internal/modules/pos/`, migration 6, POS tests | UNVERIFIED; new restaurant flow currently depends on legacy POS in parts |
| `AUD-F-007` | Purchasing, receiving, shelves and replenishment | Implemented/locally verified | `apps/api/internal/modules/purchasing/`, migration 7 | UNVERIFIED; likely advanced or obsolete for restaurant MVP |
| `AUD-F-008` | Returns, refunds, exchanges and voids | Partial/implemented for retail | `apps/api/internal/modules/returns/`, migrations 8-9 | UNVERIFIED; restaurant refund policy is not approved |
| `AUD-F-009` | Pricing, promotions and discount approvals | Implemented for current POS | `apps/api/internal/modules/pricing/`, migration 10 | UNVERIFIED; restaurant pricing/fees/tax rules are missing from source |
| `AUD-F-010` | Customer records and loyalty | Implemented for current model | `apps/api/internal/modules/customers/`, `loyalty/`, migrations 11-12 | UNVERIFIED |
| `AUD-F-011` | Batch quality, FEFO, quarantine, write-offs and recalls | Implemented with stated limits | `apps/api/internal/modules/inventory/quality.go`, migration 13 | UNVERIFIED; physical verification and recall release remain limited |
| `AUD-F-012` | Public storefront directory and published catalog | Partial | `apps/api/internal/modules/storefront/`, `apps/web/src/features/storefront/`, migration 14 | UNVERIFIED; marketplace semantics are not supplied |
| `AUD-F-013` | Guest ordering and private tracking | Partial | `storefront/orders.go`, `ShopCartPage.tsx`, tracking routes | UNVERIFIED; customer account and completed online payment are incomplete |
| `AUD-F-014` | Reservations and online stock sources | Partial/paused | migrations 15-16 and storefront integration tests | UNVERIFIED; source arbitration and retained-data rollout are not accepted |
| `AUD-F-015` | Online payment persistence, holds and reconciliation | Partial/paused | migrations 17-23, `payment_reconciliation.go`, payment sandbox docs | UNVERIFIED; real provider/runtime/customer flow is incomplete |
| `AUD-F-016` | Restaurant onboarding, profiles, dining tables and menu | Partial | `restaurant/`, migrations 30 and 37-39, organization feature tests | UNVERIFIED; current restaurant HTTP still accepts `branch_id` |
| `AUD-F-017` | Kitchen queue and order statuses | Partial/conflicting | `restaurant/queue.go`, `storefront/orders.go`, migrations 27-28 | UNVERIFIED; paid-before-kitchen and strict FIFO target must be approved |
| `AUD-F-018` | Payment-before-kitchen enforcement | Partial, evidence in historical handoff | `pos/prepaid.go`, `storefront/payment_reconciliation.go`, `SESSION_HANDOFF.md:68` | UNVERIFIED; current flow still crosses POS/shift assumptions |
| `AUD-F-019` | Direct restaurant sale/receipt without retail prerequisites | Missing in current accepted code | `SESSION_HANDOFF.md:244-310` describes pending work; no accepted direct settlement boundary found | UNVERIFIED |
| `AUD-F-020` | AI forecasts, reorder advice and anomaly explanations | Missing; health-only service exists | `apps/ai/app/main.py`, `apps/ai/pyproject.toml`, README overview | UNVERIFIED; AI authority must remain advisory |
| `AUD-F-021` | Reports, hardware, tax and production operations | Missing or not certified | README limitations and route inventory | UNVERIFIED |
| `AUD-F-022` | Contract and route consistency | Partial/conflicting | `packages/contracts/routes.json` lists 18 modules/109 routes; current React router and Go registrations are narrower/different | UNVERIFIED |

### 5.1 Known conflicts and obsolete surfaces

- The current restaurant module still models settings, recipes, tables and
  queue by `branch_id` (`apps/api/internal/modules/restaurant/http.go`). The
  current branch history and handoff describe a branchless restaurant
  direction, but that direction is historical and not an approved 92-item
  requirement source.
- The retail POS remains the accepted financial path for several online pickup
  flows. A direct restaurant settlement path without branch, terminal, cart or
  shift is not currently accepted evidence.
- `packages/contracts/routes.json` contains dashboards, AI, reports, employee,
  settings, shelf and retail routes that are not all present in the current
  React router or current owner-only navigation. These entries must be
  reconciled before deprecation.
- The `staff`/employee workspace direction is described as retired in current
  architecture notes, but historical data and backend modules remain. This is
  a compatibility and authorization concern, not permission to delete them.
- Historical `TODO.md` references in `AGENTS.md`, `SESSION_HANDOFF.md`, and
  older plans are stale on this branch; the latest commit is
  `b586915 chore: remove obsolete TODO file`.

## 6. Functional requirement baseline

These are audit-derived baseline constraints for the migration plan. They are
not substitutes for the missing approved requirements.

| ID | Baseline requirement | Evidence/priority |
| --- | --- | --- |
| `BASE-F-001` | Preserve existing organizations, users, memberships, branches, catalog, inventory, sales, payment evidence, refunds, audit events and immutable history. | `AGENTS.md`, migrations, architecture docs; release blocker. |
| `BASE-F-002` | Keep browser -> Go API -> PostgreSQL as the public execution boundary; browser must not access PostgreSQL or internal AI directly. | `AGENTS.md`, `docs/architecture/overview.md`; architectural invariant. |
| `BASE-F-003` | Enforce organization and branch scope in server authorization and scoped queries; frontend guards are presentation only. | `AGENTS.md`, `docs/security/security-model.md`; security blocker. |
| `BASE-F-004` | Preserve exact money/quantity units, decimal precision, idempotency, audit and atomic transaction boundaries. | `AGENTS.md`, POS/inventory/returns docs; data-integrity blocker. |
| `BASE-F-005` | Do not transition a kitchen order to `PREPARING` or `READY` until the approved payment and stock/reconciliation predicates are satisfied. | `AGENTS.md`, current restaurant/online payment tests; target rule needs approval mapping. |
| `BASE-F-006` | Keep AI advisory only; it must not autonomously mutate stock, authorize purchases, settle payments or approve retail actions. | `AGENTS.md`, README, AI boundary docs. |
| `BASE-F-007` | Add forward-only migrations and preserve rollback/forward-recovery evidence; never edit applied migrations or delete business data. | Migration conventions and user instruction. |
| `BASE-F-008` | Maintain public API compatibility or document versioned changes across Go producers, OpenAPI, route inventory and React consumers. | `smartpos-api-contract`, contracts, tests. |

## 7. Non-functional requirements baseline

| ID | Baseline requirement | Measurable acceptance direction |
| --- | --- | --- |
| `BASE-NFR-001` | Tenant isolation | Negative tests prove cross-organization and unauthorized branch reads/writes are rejected at API and database layers. |
| `BASE-NFR-002` | Replay safety | Replaying the same idempotency key returns the original result without duplicate order, payment, sale, stock, receipt or audit effects. |
| `BASE-NFR-003` | Concurrency safety | Concurrent setup, order, payment, queue, refund and settlement cases preserve one valid state transition and no double posting. |
| `BASE-NFR-004` | FIFO queue integrity | Queue ordering is deterministic by persisted sequence/created identity, is scoped to restaurant/service period, and cannot skip or duplicate eligible work. |
| `BASE-NFR-005` | Recoverability | Partial failures leave durable reconciliation evidence and provide a documented retry/recovery path without data deletion. |
| `BASE-NFR-006` | Accessibility/responsiveness | Affected flows are checked at 360px, 390px and 1280px with keyboard focus, readable wrapping, touch targets and no horizontal overflow. |
| `BASE-NFR-007` | Observability | API and internal service errors include safe request correlation and structured logs without credentials, payment secrets or token payloads. |
| `BASE-NFR-008` | Migration safety | Fresh and retained-data upgrade tests run only against explicitly isolated task-owned databases; down migrations refuse unsafe populated rollback where required. |
| `BASE-NFR-009` | Performance baseline | MVP order/queue/payment endpoints receive a measured latency and concurrency budget before optimization claims are made. |
| `BASE-NFR-010` | Deployment safety | No production or retained-primary migration/deployment is performed during specification work; release requires a versioned artifact and rollback plan. |

## 8. Approved requirement source gap register

The following IDs reserve traceability slots for the 92 approved requirements.
They carry no invented title, behavior, priority or acceptance rule. Replace
each row with the approved statement and source reference before implementation.

| ID | Status | Approved statement | Source | Classification |
| --- | --- | --- | --- | --- |
| `VP-UNVERIFIED-001` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-002` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-003` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-004` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-005` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-006` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-007` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-008` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-009` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-010` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-011` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-012` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-013` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-014` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-015` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-016` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-017` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-018` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-019` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-020` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-021` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-022` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-023` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-024` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-025` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-026` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-027` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-028` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-029` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-030` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-031` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-032` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-033` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-034` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-035` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-036` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-037` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-038` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-039` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-040` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-041` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-042` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-043` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-044` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-045` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-046` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-047` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-048` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-049` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-050` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-051` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-052` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-053` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-054` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-055` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-056` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-057` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-058` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-059` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-060` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-061` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-062` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-063` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-064` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-065` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-066` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-067` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-068` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-069` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-070` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-071` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-072` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-073` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-074` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-075` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-076` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-077` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-078` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-079` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-080` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-081` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-082` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-083` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-084` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-085` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-086` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-087` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-088` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-089` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-090` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-091` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |
| `VP-UNVERIFIED-092` | UNVERIFIED | Missing | Missing 92-item register | Cannot classify |

## 9. Audit-derived acceptance criteria for future approval mapping

These criteria are proposed verification seams only. They become normative
only after the approved requirement register links to them.

1. Fresh restaurant setup creates the approved tenant/profile/menu state
   without requiring unapproved retail prerequisites.
2. Public customer ordering creates one durable order with immutable price,
   fee, fulfillment and customer snapshots.
3. Payment retries are idempotent and cannot duplicate authorization, capture,
   sale, receipt, stock reservation or audit effects.
4. Only paid, eligible orders enter the kitchen queue; refund and fulfillment
   reconciliation blockers are excluded.
5. FIFO queue processing is deterministic, scoped, race-safe and auditable.
6. Settlement writes payment evidence, order event, sale/receipt (if approved),
   audit event and stock/reservation effects atomically.
7. Cross-tenant, unauthorized-role, stale-revision and replay attempts fail
   without leaking private data or changing business state.
8. Legacy retail records remain readable and immutable while new restaurant
   flows are introduced through additive schema and compatibility boundaries.
9. Browser tests cover desktop and narrow touch layouts, loading, empty,
   error, recovery, keyboard focus and long-content wrapping.
10. Migration tests prove fresh install, retained-data upgrade, safe refusal of
    destructive rollback, and forward recovery for partial migration states.

## 10. Required decisions before implementation

- Provide the authoritative 92 approved requirement statements, IDs, priorities
  and acceptance criteria.
- Confirm whether one restaurant equals one organization and whether branches
  are prohibited for new restaurant operations while retained for legacy data.
- Confirm whether restaurant payment is cash/manual, online provider-backed,
  prepaid, or all three for MVP.
- Confirm whether restaurant orders consume stock/recipes in MVP or use
  menu-only mode with no inventory prerequisite.
- Confirm marketplace scope: directory only, multi-store basket, delivery
  orchestration, customer accounts, commissions, or another bounded meaning.
- Confirm role model after the owner-only transition and the fate of staff,
  employee, report, hardware, tax and AI route inventory entries.
- Confirm required operational targets for latency, availability, backups,
  retention, accessibility, observability and deployment environments.

Implementation is intentionally blocked until these decisions and the 92-item
source are reviewed.
