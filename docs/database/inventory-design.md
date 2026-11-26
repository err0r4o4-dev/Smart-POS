# Inventory invariants - planned

Locations: WAREHOUSE, SHELF, QUARANTINE, DAMAGED, IN_TRANSIT. Movements record tenant/branch/product/batch, signed base-unit quantity, reason, source document, actor, timestamp, idempotency.

Reasons: PURCHASE_RECEIVE, SALE, SALE_RETURN, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, WRITE_OFF. Corrections append compensations; never edit balance alone.

Transfers lock rows in deterministic order, check scope/availability, append paired ledger records and update balances atomically. Warehouse 100 + shelf 20, transfer 30 -> 70 + 50; total 120 unchanged. Cross-branch uses dispatch/in-transit/receipt states.

Checkout stock mutation shares sale/payment/idempotency transaction and explicit oversell policy. FEFO/batches arrive Phase 5. Shelf quantities are recorded estimates, not physical sensing.

Future tests: concurrent oversell, retries, rollback, conservation, tenant/branch denial, fractional units, expiry and count reconciliation. No inventory business implementation in Phase 0.
