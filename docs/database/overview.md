# Database foundation

Migration 000001 creates organizations/branches: UUID keys supplied by app, timestamptz, composite tenant references, organization-scoped unique branch code, explicit checks. No seed credentials/users/sales or extensions.

Both tables ENABLE and FORCE RLS. Transaction-local `app.organization_id` derives from authorized membership. Missing context yields no rows. Superusers bypass RLS: Compose bootstrap user is local-only. Phase 1 must create non-owner runtime role, deny DDL and test tenant/branch paths. Scoped queries remain mandatory.

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

Tenant tables carry organization_id; branch tables also branch_id. Composite FKs prevent cross-tenant references. Unique/index keys include tenant and derive from queries. Money bigint minor units + currency; fractional quantity numeric(18,3) with conversion/rounding rules. Ledger append-only; balances transactional projections.

`npm run migrate` runs pinned golang-migrate up locally, also automatic before API starts. Paired down migration is destructive and never automatic. Add sequential migrations; never edit deployed migrations. Non-disposable changes require backup/rollback approval. Readiness rejects missing/dirty/outdated schema.
