# Module specifications

Phase 0 implements platform/presentation, Phase 1A implements identity, Phase 1B implements organization/branch/employee membership management with fixed RBAC Phase 1C implements product catalog and Phase 2 implements inventory core. Other business functionality remains planned. API groups/events below are proposals unless explicitly marked implemented; the live source is OpenAPI. Page counts remain the canonical 16-module/106-route inventory. Upstream dependencies are constrained by dependencies.md. See [Phase 1B architecture](organization.md) and [Phase 1C architecture](catalog.md).

Phase numbers identify the primary delivery phase: POS returns/exchanges and sale refunds extend into Phase 5; settings integrations/backup and the support page extend into Phase 7. Dashboard/help have only the explicitly listed Phase 0 presentations.

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
- Planned API groups: /pos, /payments, /registers.
- Domain entities: sales, sale_items, payments, register_shifts, held_carts.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: pos.checkout, register.manage; approval for override.
- Business events: SaleCompleted, RegisterClosed.
- Error cases: insufficient stock, payment mismatch, duplicate request.
- Tests: concurrent checkout, idempotency, exact totals, failed payment.
- Implementation phase: 3.
- Current status: layout preview only, no checkout.

## Sales (6 pages)

- Business purpose: Traceable sale and receipt history.
- Responsibilities: Immutable sale snapshots, void/refund authorization, receipts.
- Planned pages: `/sales`, `/sales/:id`, `/sales/refunds`, `/sales/voids`, `/receipts`, `/sales/tax-documents`.
- Planned API groups: /sales, /receipts.
- Domain entities: sales, sale_items, refunds, returns, receipts.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: sales.read, sales.void, refund.approve.
- Business events: SaleVoided, RefundApproved.
- Error cases: invalid state, duplicate refund, absent receipt.
- Tests: tenant/branch denial, refund limits, snapshots.
- Implementation phase: 3.
- Current status: documented/planned; no implementation.

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
- Current status: Phase 2.1–2.6 implemented and locally verified on ten routes. /inventory/valuation stays Planned; no costing, checkout, purchasing, reservations or advanced shelf workflows.

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

- Business purpose: Consistent prices and approved discounts.
- Responsibilities: Price lists, promotion eligibility, precedence, approvals.
- Planned pages: `/pricing`, `/pricing/lists`, `/promotions`, `/promotions/:id`, `/discount-approvals`.
- Planned API groups: /pricing, /promotions, /approvals.
- Domain entities: price_lists, promotions, promotion_rules, approval_requests.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: pricing.manage, promotions.manage, discount.approve.
- Business events: PriceChanged, PromotionActivated.
- Error cases: overlapping promotion, expired rule, unauthorized override.
- Tests: exact rounding, stacking precedence, override denial.
- Implementation phase: 5.
- Current status: documented/planned; no implementation.

## Customers (5 pages)

- Business purpose: Customer relationships and earned loyalty.
- Responsibilities: Customer groups, consent, loyalty accrual/redemption/history.
- Planned pages: `/customers`, `/customers/:id`, `/customers/groups`, `/loyalty`, `/loyalty/history`.
- Planned API groups: /customers, /loyalty.
- Domain entities: customers, loyalty_accounts, loyalty_transactions.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: customers.read, customers.write, loyalty.adjust.
- Business events: CustomerCreated, LoyaltyAccrued.
- Error cases: insufficient points, duplicate accrual, invalid consent.
- Tests: PII scope, reversal, duplicate events, redemption concurrency.
- Implementation phase: 5.
- Current status: documented/planned; no implementation.

## Quality & Expiry (4 pages)

- Business purpose: Reduce expiry and unsafe stock risk.
- Responsibilities: Batches, expiry, quarantine, recalls, approved write-offs.
- Planned pages: `/inventory/batches`, `/inventory/expiry`, `/inventory/write-offs`, `/inventory/recalls`.
- Planned API groups: /quality.
- Domain entities: product_batches, write_offs, recall_cases.
- Dependencies: owning domains/upstream capabilities in [dependency matrix](dependencies.md); authorization through identity and organization for all tenant operations.
- Permissions: quality.read, quality.quarantine, writeoff.approve.
- Business events: BatchQuarantined, StockWrittenOff.
- Error cases: expired batch, invalid recall scope, denied write-off.
- Tests: FEFO, quarantine unsellable, write-off ledger consistency.
- Implementation phase: 5.
- Current status: documented/planned; no implementation.

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
