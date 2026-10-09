# Database foundation

Migration 000001 creates organizations/branches: UUID keys supplied by app, timestamptz, composite tenant references, organization-scoped unique branch code, explicit checks. Migration 000002 adds global users, hashed auth sessions, hashed reset tokens, auth audit events and hashed rate-limit keys. No seed credentials/users/sales or extensions.

The organization/branch Phase 1C catalog and Phase 2 inventory tables ENABLE and FORCE RLS. Transaction-local `app.organization_id` derives from authorized membership. Missing context yields no catalog rows. Superusers bypass RLS: Compose bootstrap user is local-only. Migration 000003 created the non-owner runtime role `smartpos_runtime`; API connections SET ROLE to it. Scoped queries remain mandatory. Membership/invitation tables remain application-scoped, not blanket database RLS.

| Domain         | Implemented/proposed tables                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | users, sessions, roles, permissions, organization_members                                                                                       |
| Catalog        | products, product_variants, product_barcodes, categories, brands, units                                                                         |
| Inventory      | stock_locations, stock_balances, stock_movements, inventory_operations, inventory_documents, inventory_document_items, inventory_reorder_points |
| Shelves        | shelves, shelf_slots, replenishment_tasks                                                                                                       |
| Purchasing     | suppliers, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items                                                           |
| Sales/payments | sales, sale_items, payments, refunds, returns, receipts, register_shifts                                                                        |
| Customers      | customers, loyalty_accounts, loyalty_transactions                                                                                               |
| Promotions     | promotions, promotion_rules                                                                                                                     |
| Quality        | product_batches, write_offs                                                                                                                     |
| Intelligence   | forecast_runs, demand_forecasts, ai_recommendations, anomaly_alerts                                                                             |
| System         | notifications, approval_requests, audit_logs, idempotency_keys, outbox_events                                                                   |

Tenant tables carry organization_id; branch tables also branch_id. Composite FKs prevent cross-tenant references. Unique/index keys include tenant and derive from queries. Catalog money is implemented as NUMERIC(18,2) + organization currency and exact decimal strings in Go/JSON/TypeScript; future transactional totals may use minor units with an explicit conversion policy. Phase 2 implements NUMERIC(18,3) quantities, an append-only ledger and transactional balance projections; see inventory-ledger.md.

`npm run migrate` runs pinned golang-migrate up locally, also automatic before API starts. Migrations are forward-only; do not run down/drop automatically. Add sequential migrations; never edit deployed migrations. Non-disposable changes require backup/rollback approval. Readiness rejects missing/dirty/outdated schema (required version 5).

## Phase 1C catalog migration

`000004_catalog.up.sql` adds categories, brands, units, products, product_variants, product_barcodes and product_import_jobs without changing migrations 1–3 or creating stock data. Tenant-composite references cover parent categories, unit bases, product taxonomy and variant/barcode ownership. Category/brand/unit names and SKU/barcode values have organization-scoped unique indexes; archived SKUs stay reserved. One partial unique index enforces at most one primary barcode per variant. Product lists, category/brand filters, variant/barcode parents and import history have supporting indexes.

All seven tables FORCE RLS using transaction-local organization context. Runtime grants are SELECT/INSERT/UPDATE, plus DELETE only for barcode mappings; products/variants/taxonomies/import jobs have no runtime hard-delete grant. Application validation adds category-cycle prevention, active-reference checks, exact prices, last-active-variant rules and stale revision denial. Applied schema4 and rollback-only FK/uniqueness/price/RLS/grant tests were verified in isolated `smartpos-auth-test`; no production or original-volume migration was performed. See [catalog design](../architecture/catalog.md).

## Phase 2 inventory migration

000005_inventory.up.sql adds seven tables, scoped list/history indexes, tenant-composite branch/location/Variant/document references and unique org/location/Variant balances, org/branch/code locations and org/branch/Variant reorder thresholds. Shared inventory_documents/items discriminate ADJUSTMENT, COUNT and TRANSFER rather than duplicating three document-table families. All inventory tables ENABLE/FORCE RLS; absent/mismatched tenant context sees no rows.

Runtime is SELECT-only on stock_balances and SELECT/INSERT-only on stock_movements. Append-only triggers also reject ledger UPDATE/DELETE; the SECURITY DEFINER posting trigger has fixed search_path, revoked PUBLIC execution, explicit tenant/user/unfinished-operation validation and locked quantity/version updates. A Variant unit cannot change after stock history. Opening is positive, once per identity and before any ledger history. No existing migration 1–4 was edited, no down migration or original-volume change was performed.

Migration up and repeated no-change were verified only in smartpos-auth-test, together with rollback-only constraints, RLS, precision, grants and reconciliation assertions. Readiness now requires clean schema 5. Production needs distinct least-privileged runtime LOGIN and migration credentials plus backup/recovery planning; see [ledger design](inventory-ledger.md).
