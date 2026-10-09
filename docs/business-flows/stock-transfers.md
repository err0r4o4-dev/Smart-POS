# Stock transfers — Phase 2

Implemented locally for positive exact quantities, distinct active stock locations and 1–100 distinct Variants. Source/destination may share a branch; system transit cannot be selected by users. Hierarchy is navigation, not stock rollup.

## Same branch

`DRAFT → APPROVED → RECEIVED` on dispatch. One transaction posts TRANSFER_OUT/TRANSFER_IN pairs, verifies sufficient source stock and records balances/actors/audit/retry result. No separate receipt step follows this completed conserved local transfer.

## Different branches

`DRAFT → APPROVED → DISPATCHED → RECEIVED`. Dispatch moves source stock into an automatically created transfer-specific source-branch IN_TRANSIT location. Destination on-hand does not increase until full receipt drains transit into destination. No partial receipt or cancellation after dispatch.

Create/approve needs both branches; dispatch source scope; receive destination scope. A participating receiver can inspect transfer evidence without source balance access. Owner/Manager approve, Inventory Staff create/dispatch/receive, Purchasing create/receive and Cashier cannot mutate. Every action and cached retry rechecks membership, permission and state.

New mutations require active branches/locations/catalog. Receipt may settle existing transit if the source branch later becomes inactive, while destination must stay active. This is not permission for other inactive-source mutations.

Source + transit + destination total is conserved per Variant. All items/pairs commit atomically; failures leave no partial changes. Concurrent duplicate receipts post once; exact successful key/payload retries return the saved result, altered payload conflicts. Transit is never POS eligible. See [ledger invariants](../database/inventory-ledger.md) and [verification](../development/verification.md). Purchases, sales, returns, partial delivery and costing remain Phase 3+ boundaries.
