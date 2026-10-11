# Module specifications

Phase 0 implements platform/presentation, Phase 1A implements identity, Phase 1B implements organization/branch/employee membership management with fixed RBAC Phase 1C implements product catalog and Phase 2 implements inventory core. Other business functionality remains planned. API groups/events below are proposals unless explicitly marked implemented; the live source is OpenAPI. Page counts now use the canonical 17-module/113-route inventory including Storefront. Upstream dependencies are constrained by dependencies.md. See [Phase 1B architecture](organization.md) and [Phase 1C architecture](catalog.md).

Current status supersedes older introductory scope: Phase0–4 and Phase5.1–5.7 COMPLETED (Local); Phase5 overall COMPLETED (Local); Phase6–7 NOT STARTED; Phase6 NOT READY; Production Ready NO. Existing POS/payment/stock/pricing engines are retained; Quality extends Inventory and Loyalty extends Customers. The original Phase5 checkpoint counted16 modules/106 routes; the storefront extension now brings the inventory to17 modules/113 routes. See [Quality](quality.md), [Loyalty](loyalty.md) and [final acceptance](../development/phase57-verification.md).

## Storefront (7 pages)

- Purpose: Published catalog and guest orders for pickup and payment at the store.
- Pages: `/shop`, `/shop/:slug`, `/shop/:slug/cart`, `/shop/:slug/track/:orderId`, `/settings/storefront`, `/online-orders`, `/online-orders/:orderId`.
- Owner: public Go storefront module; existing POS owns payment, sales, inventory posting and receipts.
- Permissions: storefront.manage for Owner/Manager; online_orders.read/manage for Owner/Manager/Cashier with branch scope.
- Invariants: explicit product publication, immutable estimates and pickup snapshots, hashed tracking access, idempotent creation/import/settlement, no stock reservation, no invented completion.
- Boundaries: no customer account, shipping, online payment, costing, or new payment engine. See [Storefront](storefront.md).
- Current canonical inventory: 17 modules / 113 logical routes; dated Phase5 acceptance counts below remain historical evidence, not storefront verification.

## Authentication (6 pages)

- Business purpose: Secure retailer access and onboarding.
- Responsibilities: Sessions, membership, organization setup, account recovery.
- Planned pages: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/setup`, `/account`.
- Planned API groups: /auth, /organizations, /branches.
- Domain entities: users, sessions, organizations, branches, organization_members.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: public login; identity.manage for membership.
- Business events: UserRegistered, SessionRevoked.
- Error cases: invalid credentials, expired recovery, forbidden tenant.
- Tests: session expiry, CSRF, enumeration, tenant denial.
- Implementation phase: 1.
- Current status: Phase 1A registration, login/logout, recovery, session persistence/account and Phase 1B `/setup` organization onboarding/selection/invitation acceptance are implemented and locally verified. Organization membership is distinct from global identity.

## Dashboard (4 pages)

- Business purpose: Operational visibility without owning transactional writes.
- Responsibilities: Branch read models, tasks, notifications.
- Planned pages: `/dashboard`, `/dashboard/branches`, `/tasks`, `/notifications`.
- Planned API groups: /reports/summary, /notifications.
- Domain entities: dashboard_projection, notifications, tasks.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: dashboard.read, branch.read.
- Business events: NotificationRead.
- Error cases: stale projection, denied branch.
- Tests: empty/loading/error, scoped aggregation.
- Implementation phase: 3.
- Current status: foundation shell only; all business analytics planned.

## POS (9 pages)

- Business purpose: Fast accurate checkout and cash control.
- Responsibilities: Cart, holds, checkout, register shifts; returns/exchanges Phase 5.
- Planned pages: `/pos`, `/pos/held-carts`, `/pos/checkout`, `/pos/returns`, `/pos/exchanges`, `/pos/register/open`, `/pos/register/close`, `/pos/register/history`, `/pos/shifts`.
- Implemented API group: organization-scoped /pos (terminals, carts, checkouts, payment confirmation and shifts); sales/receipts share the POS application module.
- Domain entities: pos_terminals, register_shifts, pos_carts, pos_cart_items and pos_checkouts; sale snapshots are listed below.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: pos.access/cart.manage/checkout/payment.cash/payment.manual_confirm, pos.terminal.manage and pos.register.open/close/history.read; manual overrides require Phase5.3 discount.request and currently authorized discount.approve.
- Audit: transactional terminal/cart/payment/checkout/shift lifecycle records; no event bus is claimed.
- Error cases: insufficient stock, payment mismatch, duplicate request.
- Tests: concurrent checkout, idempotency, exact totals, failed payment.
- Implementation phase: 3.
- Current status: Phase3.1–3.7 implemented on seven operational POS routes; Phase5.1 adds `/pos/returns`; Phase5.2 adds `/pos/exchanges` with durable historical return credit, approved replacement snapshots, net settlement and atomic existing POS posting. /preview/pos remains non-functional. Manual acknowledgement is not bank/gateway proof. See [POS architecture](pos.md) and [business operations](business-operations.md).

## Sales (6 pages)

- Business purpose: Traceable sale and receipt history.
- Responsibilities: Immutable completed Sale snapshots/history/receipts, manual refunds, related-document navigation and Phase5.2 compensating full-sale reversals; never deletion of completed Sales.
- Planned pages: `/sales`, `/sales/:id`, `/sales/refunds`, `/sales/voids`, `/receipts`, `/sales/tax-documents`.
- Planned API groups: /sales, /receipts.
- Implemented entities: sales, sale_items, sale_payments, receipts; Phase5.1 customer_returns/items/refunds, refund_settlement_events, register_cash_disbursements; Phase5.2 sale_adjustments and adjustment_settlement_events. Replacement payments distinguish external amount from credit_amount.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Implemented permissions: sales.read, receipts.read/print, pos.payment.reconcile; Phase5.1 returns/refunds grants and Phase5.2 exchange.read/create/approve/settlement.confirm/complete, sales.void.read/request/approve/complete. Owner/Manager approve/reverse/settle within branch scope; Cashier own exchange creation/positive acknowledgement/completion requires approval, with negative-refund and reversal completion denied.
- Audit: completed sales and explicit external funds-resolution notes; no automatic refund or event bus.
- Error cases: invalid state, duplicate refund, absent receipt.
- Tests: tenant/branch denial, refund limits, snapshots.
- Implementation phase: 3.
- Current status: /sales, /sales/:id, /receipts, /sales/refunds and /sales/voids operational. Reversals preserve original history and use inspected Return/refund compensation; prior completed returns/adjustments conservatively block full-sale reversal. 58/80 mm sales printing uses immutable snapshots; refund/exchange/reversal acknowledgements are not tax receipts. Physical printers and tax documents remain unverified/unimplemented.

## Products (9 pages)

- Business purpose: Accurate sellable catalog.
- Responsibilities: Products/variants, categories/brands/units, barcode resolution, labels and atomic import validation/confirmation.
- Planned pages: `/products`, `/products/new`, `/products/:id`, `/products/:id/edit`, `/products/import`, `/products/labels`, `/categories`, `/brands`, `/units`.
- Planned API groups: /products, /categories, /brands, /units.
- Domain entities: products, product_variants, product_barcodes, categories, brands, units.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: catalog.read/create/update/archive/import, catalog.barcode.manage, catalog.labels.print and catalog.category/brand/unit.manage; see the exact permission matrix in [catalog design](catalog.md).
- Business events: ProductCreated, BarcodeAssigned.
- Error cases: unknown barcode, duplicate code, invalid unit.
- Tests: exact prices, SKU/barcode uniqueness/concurrency, CSV/XLSX validation/bulk/atomicity, scope/RLS, unit metadata, print rendering and nine responsive pages.
- Implementation phase: 1.
- Current status: Phase 1C.1–1C.4 implemented and locally verified. All nine pages work; image upload/hardware printing and inventory remain explicit boundaries.

## Inventory (11 pages)

- Business purpose: Auditable branch stock truth.
- Responsibilities: Locations, ledger, balances, counts, adjustments, atomic transfers.
- Planned pages: `/inventory`, `/inventory/balances`, `/inventory/locations`, `/inventory/movements`, `/inventory/adjustments`, `/inventory/counts`, `/inventory/counts/:id`, `/inventory/transfers`, `/inventory/transfers/:id`, `/inventory/reorder-points`, `/inventory/valuation`.
- Implemented API group: /api/v1/organizations/{id}/inventory; 30 path templates with scoped queries, location CRUD, opening, document actions, physical observations and reorder upsert.
- Domain entities: stock_locations, stock_balances, stock_movements, inventory_operations, inventory_documents, inventory_document_items and inventory_reorder_points. ADJUSTMENT/COUNT/TRANSFER share discriminated documents.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: 16 explicit inventory grants; see inventory.md and the existing fixed role engine. Owner organization-wide; Manager assigned-active-branch scope; operational roles never approve/post without grants.
- Audit events: transactional inventory.location.saved, opening.posted, document.created and approved/posted/dispatched/received/count.saved events; no external event bus is claimed.
- Error cases: oversell, invalid location, conflicting count.
- Tests: transfer conservation, concurrency, rollback, no cross-tenant references.
- Implementation phase: 2.
- Current status: Phase 2.1–2.6 implemented and locally verified on ten routes. /inventory/valuation stays Planned; no costing, purchasing, reservations or advanced shelf workflows.

## Shelves (7 pages)

- Business purpose: Recorded shelf allocation and replenishment.
- Responsibilities: Shelf/slot layout, replenishment tasks, physical count reconciliation.
- Planned pages: `/shelves`, `/shelves/new`, `/shelves/:id`, `/shelves/layout`, `/shelves/replenishments`, `/shelves/counts`, `/shelves/discrepancies`.
- Planned API groups: /shelves.
- Domain entities: shelves, shelf_slots, replenishment_tasks.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: shelves.read, shelves.manage, shelves.replenish.
- Business events: ShelfCountRecorded, ReplenishmentCompleted.
- Error cases: capacity conflict, unavailable warehouse stock, stale count.
- Tests: warehouse-shelf conservation, recorded-vs-actual labels, count variance.
- Implementation phase: 4.
- Current status: documented/planned; no implementation.

## Purchasing (8 pages)

- Business purpose: Controlled supplier purchasing and receiving.
- Responsibilities: Supplier master, draft/approval orders, partial receiving, supplier returns.
- Planned pages: `/suppliers`, `/suppliers/:id`, `/purchasing/orders`, `/purchasing/orders/new`, `/purchasing/orders/:id`, `/purchasing/receipts`, `/purchasing/returns`, `/purchasing/suggestions`.
- Planned API groups: /purchasing, /suppliers.
- Domain entities: suppliers, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: purchasing.write, purchasing.approve, receiving.manage.
- Business events: PurchaseOrderApproved, GoodsReceived.
- Error cases: over-receipt, invalid transition, duplicate receive.
- Tests: partial receipt, retry, stock atomicity, approval denial.
- Implementation phase: 4.
- Current status: documented/planned; no implementation.

## Pricing & Promotions (5 pages)

- Business purpose: Consistent authoritative prices and approved discounts.
- Responsibilities: Scheduled organization/branch lists, promotion eligibility/precedence, exact allocation, manual approvals and atomic committed usage.
- Implemented pages: `/pricing`, `/pricing/lists`, `/promotions`, `/promotions/:id`, `/discount-approvals`.
- Implemented API groups: `/pricing/lists`, `/promotions`, `/discount-approvals` and POS cart quote; see OpenAPI.
- Domain entities: price_lists, promotions with typed JSON rules, discount_approvals, promotion_redemptions; immutable POS/Sale pricing snapshots.
- Dependencies: identity/organization authorization, Catalog identities, POS settlement, historical Returns credit and Inventory physical posting.
- Permissions: pricing.read/manage/approve, promotions.read/manage, discount.request/read/approve. Owner manages organization-wide definitions; Manager writes assigned branches; Cashier requests own-cart discounts only.
- Audits: definition mutations/transitions, approval requests/decisions and committed checkout; no speculative event bus is added.
- Error cases: stale revisions/approvals, expired eligibility, exhausted usage, foreign scope, revoked authority and post-acknowledgement pricing changes.
- Tests: exact rounding/stacking, BOGO physical deduction, final-use concurrency, replay/rollback, historical discounted refunds/exchanges, zero-payable and runtime RLS.
- Implementation phase: 5.3; [architecture](pricing.md) and [actual verification status](../development/phase53-verification.md).

## Customers (5 pages)

- Business purpose: Organization-shared customer records, explicit consent and authoritative transaction history.
- Responsibilities: Revisioned Customer CRUD/archive, groups/memberships, masked Cashier lookup/POS selection; Loyalty programs/enrollment/status, immutable points, reservations, reward discounts and reversals.
- Implemented pages: `/customers`, `/customers/:id`, `/customers/groups`, `/loyalty`, `/loyalty/history`.
- Implemented API groups: `/customers`, groups/activity/audit/membership subresources, `/loyalty` programs/accounts/adjustments/history and existing POS quote/checkout integration.
- Domain entities: customers, customer_groups, customer_group_memberships; loyalty_programs, loyalty_accounts, loyalty_ledger; immutable Sale/checkout customer and reward snapshots.
- Dependencies: identity/organization authorization, existing POS/Sales/Returns/Exchanges settlement and Inventory invariants.
- Permissions: customers.read/manage/select, customers.groups.read/manage, customers.history.read; Loyalty permissions follow the fixed role matrix.
- Audits: Customer/group edits/archive/membership and POS selection; Loyalty program/account changes, reasoned adjustments and transactional earning/redemption/compensation. No copied contact PII.
- Error cases: duplicate normalized identifiers, stale revisions, foreign tenant references, archival during checkout and revoked authorization.
- Tests: customer privacy/RBAC/RLS, idempotency/concurrency, financial activity reconciliation, immutable historical references and frontend context isolation.
- Implementation phase: 5.4 Customers and 5.5 Loyalty; exact ledger debt handling, no unintended stacking and historical partial-return compensation.
- Current status: Phase5.4–5.5 COMPLETED (Local); see [Customers](customers.md), [Loyalty](loyalty.md) and [current verification](../development/phase55-verification.md).

## Quality & Expiry (4 pages)

- Business purpose: Reduce expiry and unsafe stock risk.
- Responsibilities: Batches, expiry, quarantine, recalls, approved write-offs.
- Implemented pages: `/inventory/batches`, `/inventory/expiry`, `/inventory/write-offs`, `/inventory/recalls`.
- Implemented API group: /quality, through existing Inventory posting.
- Domain entities: product_batches, quality_stock_balances, quality_write_offs, quality_recalls; existing immutable stock_movements.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: quality.read, quality.batch.create/manage, quality.recall.manage, quality.write_off.create/approve/post.
- Business events: BatchQuarantined, StockWrittenOff.
- Error cases: expired batch, invalid recall scope, denied write-off.
- Tests: FEFO/verified selection, expiry/quarantine/recall denial, tracked/untracked conservation, receiving/shelf/POS/returns, concurrent Sale/WriteOff/Recall, RBAC/RLS and gateway browser.
- Implementation phase: 5.6; final integration/security5.7.
- Current status: COMPLETED (Local); see [Quality](quality.md) and [final acceptance](../development/phase57-verification.md). Physical provenance, split-lot picking, tracked counts and recall release remain explicit limitations.

## AI Intelligence (6 pages)

- Business purpose: Explainable non-authoritative decision support.
- Responsibilities: Forecasts, reorder proposals, shelf risk, anomaly explanation.
- Planned pages: `/ai/overview`, `/ai/forecast`, `/ai/reorder`, `/ai/shelf`, `/ai/anomalies`, `/ai/explanations`.
- Planned API groups: /ai.
- Domain entities: forecast_runs, demand_forecasts, ai_recommendations, anomaly_alerts.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: ai.read, ai.run; no stock/payment approval permission.
- Business events: ForecastCompleted, RecommendationProposed.
- Error cases: insufficient data, unavailable model, timeout, invalid output.
- Tests: deterministic baseline, model provenance, no mutation, outage isolation.
- Implementation phase: 6.
- Current status: documented/planned; no implementation.

## Reports (7 pages)

- Business purpose: Scoped business analytics and exports.
- Responsibilities: Sales, profit, inventory, shelves, employees, export jobs.
- Planned pages: `/reports`, `/reports/sales`, `/reports/profit`, `/reports/inventory`, `/reports/shelves`, `/reports/employees`, `/reports/export`.
- Planned API groups: /reports.
- Domain entities: reporting_read_models, report_exports.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: reports.read, reports.profit, reports.export.
- Business events: ReportExported.
- Error cases: stale data, unauthorized margin, oversized export.
- Tests: source reconciliation, exact totals, tenant scope, export safety.
- Implementation phase: 6.
- Current status: documented/planned; no implementation.

## Employees & Permissions (5 pages)

- Business purpose: Least-privilege staff operations.
- Responsibilities: Staff lifecycle, roles, branch grants, approval queue, audit views.
- Planned pages: `/employees`, `/employees/:id`, `/roles`, `/approvals`, `/audit-logs`.
- Planned API groups: /employees, /roles, /approvals, /audit-logs.
- Domain entities: users, roles, permissions, organization_members, approval_requests, audit_logs.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: employees.manage, roles.manage, approvals.review, audit.read.
- Business events: MembershipChanged, RoleGranted, ApprovalDecided.
- Error cases: self-escalation, last owner removal, expired approval.
- Tests: role/branch matrix, escalation denial, immutable audit.
- Implementation phase: 1.
- Current status: Phase 1B `/employees`, `/employees/:id`, `/roles` implement invitations, scoped employee read/update/removal, fixed-role matrix and member change history. Live API is `/organizations/{id}/members`, `/invitations`, `/roles`, `/permissions`, `/audit`, plus `/invitations/accept`, not the proposed generic groups above. `/approvals` and `/audit-logs` remain planned. Operational sales/inventory/purchasing permissions are deferred.

## Settings (10 pages)

- Business purpose: Retailer configuration and integrations.
- Responsibilities: Store/branch, tax, receipts, payments, hardware, notifications, backup policy.
- Planned pages: `/settings`, `/settings/store`, `/settings/branches`, `/settings/payments`, `/settings/tax`, `/settings/receipts`, `/settings/hardware`, `/settings/notifications`, `/settings/integrations`, `/settings/backup`.
- Planned API groups: /settings, /organizations, /branches.
- Domain entities: organizations, branches, settings, integration_configs.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: settings.read, settings.manage, integration.manage.
- Business events: SettingsChanged, BranchCreated.
- Error cases: invalid tax, unsupported hardware, secret exposure.
- Tests: config validation, secret redaction, branch isolation.
- Implementation phase: 1.
- Current status: Phase 1B `/settings/store` and `/settings/branches` implement organization settings and branch create/edit/deactivation with permission checks. Other settings pages remain planned; there is no production integrations/backup/tax/payment functionality.

## Help & System (4 pages)

- Business purpose: Clear support and system states.
- Responsibilities: Help, future support contact, accessible forbidden/not found.
- Planned pages: `/help`, `/support`, `/403`, `/404`.
- Planned API groups: /system.
- Domain entities: none in Phase 0.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: public foundation only.
- Business events: none in Phase 0.
- Error cases: unknown route, forbidden navigation.
- Tests: keyboard, semantic errors, no dead links.
- Implementation phase: 0.
- Current status: help, 403 and 404 implemented; support planned.
