# Inventory ledger — Phase 2

Implemented and verified against isolated local schema 5. See [inventory architecture](../architecture/inventory.md) and [verification](../development/verification.md). This is a quantity ledger, not costing, valuation or accounting. Schema15 adds [online reservation protection](../architecture/online-reservations.md) around the existing ledger; the Phase 2 evidence below remains historical.

## Identity and precision

Identity is `(organization_id, location_id, variant_id)`; composite FKs constrain branch to location. Products do not have a second balance beside their Variants. Parent locations describe navigation only; parent and child stock are separate identities, never recursive totals.

Quantities use `NUMERIC(18,3)` and API decimal strings. Go validation and browser variance use exact scaled integers. COUNT/PACKAGING require whole units; WEIGHT/VOLUME permit three decimal places. Negative on-hand, zero movement delta and out-of-range quantities reject. Variant unit changes reject after stock history; referenced catalog unit definitions cannot change.

## Additive schema

Migration `000005_inventory.up.sql` adds seven tables without rewriting migrations 1–4:

| Table                      | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `stock_locations`          | Branch hierarchy, type/status/revision and protected system transit  |
| `inventory_operations`     | Actor/path/key/payload fingerprint and committed retry result        |
| `inventory_documents`      | Discriminated ADJUSTMENT/COUNT/TRANSFER header/state/actors          |
| `inventory_document_items` | Unique Variant per document, quantity, snapshot/version/observations |
| `stock_balances`           | One materialized nonnegative quantity/version per stock identity     |
| `stock_movements`          | Append-only signed deltas, before/after, actor, operation/document   |
| `inventory_reorder_points` | Branch/Variant minimum/target/status                                 |

Composite FKs bind branch/location/Variant/document/operation to tenant. Unique keys protect location codes, balances, document items, operation retries and reorder points. A partial unique index allows one opening per identity. Listing indexes cover locations, document kind/status/destination, balances and ledger identity/time.

## Atomic posting

1. Authenticate and authorize tenant, permission and participating branch scope inside the transaction; recheck authorization before serving a saved retry.
2. Serialize commands using the existing organization lock. Claim organization + actor + operation/path + UUID Idempotency-Key with canonical JSON SHA-256 fingerprint. Changed payload conflicts; failed commands roll back claims.
3. Insert through `inventory_apply_movement`: validate tenant/user context, owned unfinished operation, active location, unit precision and opening history.
4. Create a zero balance if necessary, lock its row, derive before/after, reject negative result, then update quantity/version atomically.
5. Commit all movement pairs, document transitions, audit and saved retry JSON together. Any failed item rolls back everything. Exact successful retries do not post again.

`quantity_after = quantity_before + quantity_delta`; balance equals the sum of committed deltas. Posting asserts exactly one inserted row. No-op count/correction items do not insert zero-delta movements. Historical ledger cannot be repaired in place; use a new authorized compensating document with its own reason/references. No automatic reversal API exists.

Runtime balances are SELECT-only; movements SELECT/INSERT-only. An immutability trigger also rejects movement UPDATE/DELETE. The narrow posting function is SECURITY DEFINER with fixed search_path, revoked PUBLIC execution and explicit tenant/user/operation checks, not an arbitrary SQL entrypoint. Other inventory tables permit SELECT/INSERT/UPDATE, not deletion. All seven ENABLE/FORCE tenant RLS; branch authorization is an independent application gate. Production requires restricted database/network access and separate migration/runtime LOGIN credentials, not local privileged bootstrap access.

## Movement types

| Type                               | Meaning                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `OPENING_BALANCE`                  | Positive, once per identity, before any history                     |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | Approved delta or absolute-target correction difference             |
| `COUNT_CORRECTION`                 | Physical count difference after every snapshot version validates    |
| `TRANSFER_OUT` / `TRANSFER_IN`     | Conserved same-branch pair                                          |
| `TRANSFER_DISPATCH`                | Inter-branch source decrease and transfer-specific transit increase |
| `TRANSFER_RECEIVE`                 | Transit decrease and destination increase; full receipt only        |

See [adjustments](../business-flows/inventory-adjustments.md), [counts](../business-flows/stock-counts.md) and [transfers](../business-flows/stock-transfers.md). Reservations are explicitly zero. Only active SALES_FLOOR/SHELF with active branch/Product/Variant is POS eligible. Warehouse is visible but not directly sellable; quarantine/damaged/transit/inactive branches are restricted. Reorder totals use active warehouse/sales-floor/shelf, never transit or parent rollups.

## Read-only reconciliation

Run under an authorized runtime tenant transaction with the existing organization context. This reports discrepancies without changing stock:

```sql
SELECT balance.organization_id, balance.location_id, balance.variant_id,
       balance.quantity, COALESCE(ledger.quantity, 0) AS ledger_quantity
FROM stock_balances AS balance
LEFT JOIN (
  SELECT organization_id, location_id, variant_id,
         SUM(quantity_delta) AS quantity
  FROM stock_movements
  GROUP BY organization_id, location_id, variant_id
) AS ledger USING (organization_id, location_id, variant_id)
WHERE balance.quantity <> COALESCE(ledger.quantity, 0);
```

Integration checks reconciliation after successful, failed and racing commands. SQL fixtures roll back; HTTP fixtures persist only in the isolated test stack.

## Operational boundaries

Migration 5 was applied only in smartpos-auth-test; repeated up reports no change and readiness requires clean schema 5. It is now immutable; later changes need additive migrations. Original volumes were not migrated/reset/deleted. Production migration/deployment and backup/restore are not part of acceptance.

Tenant serialization is not a high-throughput POS/load certification. No automated idempotency/audit/transit retention job, partial receipt, post-dispatch cancellation, batch/expiry, reservations or costing. Phase 3/4 must use authorized atomic inventory application commands, not direct balance writes.
