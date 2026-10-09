# Database foundation

Migration 000001 creates organizations/branches: UUID keys supplied by app, timestamptz, composite tenant references, organization-scoped unique branch code, explicit checks. Migration 000002 adds global users, hashed auth sessions, hashed reset tokens, auth audit events and hashed rate-limit keys. No seed credentials/users/sales or extensions.

The organization/branch and Phase 1C catalog tables ENABLE and FORCE RLS. Transaction-local `app.organization_id` derives from authorized membership. Missing context yields no catalog rows. Superusers bypass RLS: Compose bootstrap user is local-only. Migration 000003 created the non-owner runtime role `smartpos_runtime`; API connections SET ROLE to it. Scoped queries remain mandatory. Membership/invitation tables remain application-scoped, not blanket database RLS.

| Domain         | Planned tables                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Identity       | users, sessions, roles, permissions, organization_members                                          |
| Catalog        | products, product_variants, product_barcodes, categories, brands, units                            |
| Inventory      | stock_locations, stock_balances, stock_movements, stock_transfers, stock_counts, stock_adjustments |
| Shelves        | shelves, shelf_slots, replenishment_tasks                                                          |
| Purchasing     | suppliers, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items              |
| Sales/payments | sales, sale_items, payments, refunds, returns, receipts, register_shifts                           |
| Customers      | customers, loyalty_accounts, loyalty_transactions                                                  |
| Promotions     | promotions, promotion_rules                                                                        |
| Quality        | product_batches, write_offs                                                                        |
| Intelligence   | forecast_runs, demand_forecasts, ai_recommendations, anomaly_alerts                                |
| System         | notifications, approval_requests, audit_logs, idempotency_keys, outbox_events                      |

Tenant tables carry organization_id; branch tables also branch_id. Composite FKs prevent cross-tenant references. Unique/index keys include tenant and derive from queries. Catalog money is implemented as NUMERIC(18,2) + organization currency and exact decimal strings in Go/JSON/TypeScript; future transactional totals may use minor units with an explicit conversion policy. Fractional quantities, an append-only ledger and transactional balance projections remain Phase 2 design proposals.

`npm run migrate` runs pinned golang-migrate up locally, also automatic before API starts. Migrations are forward-only; do not run down/drop automatically. Add sequential migrations; never edit deployed migrations. Non-disposable changes require backup/rollback approval. Readiness rejects missing/dirty/outdated schema (required version 4).

## Phase 1C catalog migration

`000004_catalog.up.sql` adds categories, brands, units, products, product_variants, product_barcodes and product_import_jobs without changing migrations 1–3 or creating stock data. Tenant-composite references cover parent categories, unit bases, product taxonomy and variant/barcode ownership. Category/brand/unit names and SKU/barcode values have organization-scoped unique indexes; archived SKUs stay reserved. One partial unique index enforces at most one primary barcode per variant. Product lists, category/brand filters, variant/barcode parents and import history have supporting indexes.

All seven tables FORCE RLS using transaction-local organization context. Runtime grants are SELECT/INSERT/UPDATE, plus DELETE only for barcode mappings; products/variants/taxonomies/import jobs have no runtime hard-delete grant. Application validation adds category-cycle prevention, active-reference checks, exact prices, last-active-variant rules and stale revision denial. Applied schema4 and rollback-only FK/uniqueness/price/RLS/grant tests were verified in isolated `smartpos-auth-test`; no production or original-volume migration was performed. See [catalog design](../architecture/catalog.md).
