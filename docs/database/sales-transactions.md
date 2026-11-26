# POS database invariants

Forward migration `000006_pos_sales.up.sql` introduced POS/sales; current readiness requires exact clean version13 after additive Returns/Exchanges/Pricing/Customers/Loyalty/Quality migrations. Migrations000001–000011 remain unchanged; see [final acceptance](../development/phase57-verification.md). See [business operations additions](business-operations.md) for SALE_RETURN and current-shift cash refunds. Apply only through an approved up-only migration/backup/restore workflow; never modify applied historical migrations or use the primary database as verification scratch.

| Table           | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| pos_terminals   | Tenant/branch terminal identity and exact sale stock location                           |
| register_shifts | Open/closed cashier shift and exact cash reconciliation                                 |
| pos_carts       | Cashier/terminal cart lifecycle, revision and create key                                |
| pos_cart_items  | Persisted variant quantities and quoted prices                                          |
| pos_checkouts   | Frozen totals/items, idempotency fingerprint, durable funds confirmation and resolution |
| sales           | Immutable completed sale and store/branch/cashier snapshots                             |
| sale_items      | Immutable product/unit/price/quantity snapshots                                         |
| sale_payments   | One immutable confirmed payment per completed sale                                      |
| receipts        | One stable receipt identity per completed sale                                          |

`stock_movements.sale_id` references a tenant/branch sale. SALE is added to the existing movement-type CHECK. Only SALE movements carry sale_id. Stock deduction uses the existing Inventory operation and ledger trigger; POS never directly changes `stock_balances`.

All nine new tables ENABLE/FORCE RLS on the transaction-local organization context. Composite foreign keys enforce terminal/shift/cart/checkout tenant and branch relationships and sale-item location ownership. Runtime grants permit only necessary cart/operational writes; completed sale tables permit SELECT/INSERT, not UPDATE/DELETE.

Unique indexes cover terminal codes, one open terminal shift, one open cashier shift, live-cart checkout, actor-scoped request keys, one sale per cart/checkout/operation and one payment/receipt per sale. History indexes order by organization/branch/time/id; lists are bounded to 100 rows per API page.

Deferred `sale_consistency` validates completed cart/checkout/cashier/shift identity, exact confirmed payment evidence, a completed Inventory operation, receipt, item sum, and one matching negative SALE movement per item. Local settlement sets the constraint IMMEDIATE before commit, so inconsistency rolls back into durable reconciliation rather than losing the money acknowledgement.

History guards freeze closed shifts and completed/cancelled/resolved checkout evidence. UPDATE/DELETE triggers reject completed sale mutations. INSERT guards also reject appending items/payments/receipts/movements after the linked checkout is completed, even under direct runtime SQL. Existing Inventory ledger immutability and negative-stock guards remain unchanged.

## Validation and rollout boundaries

Validation ran only in `smartpos-auth-test` and a newly created scratch database. The initial fresh raw-SQL attempt needed the migration runner's `schema_migrations` prerequisite; the subsequent chain passed with that tracking table initialized. The development test DB received matching CHECK/guard/function amendments while migration 6 was being developed; none of this is a production migration procedure.

No primary-stack migration, database deletion, volume replacement or down migration was performed. Scratch validation databases and fixture rows were retained. The bootstrap connection is privileged in local Compose, although application transactions use `smartpos_runtime`; production needs a dedicated least-privilege LOGIN identity, approved backups/restore tests and monitored reconciliation.
