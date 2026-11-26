# Inventory adjustments — Phase 2

Implemented locally. Each adjustment records reason/notes, one branch/location and 1–100 distinct Variants; it is not a direct balance edit.

`DRAFT → PENDING_APPROVAL → APPROVED → POSTED`. Reject/cancel is terminal before posting. Owner/Manager self-approval is explicitly allowed and audited; separation of duties is not claimed.

- INCREASE/DECREASE take positive delta magnitudes; DECREASE cannot produce negative stock.
- CORRECTION takes an absolute nonnegative target, capturing current quantity/version at creation. Changed versions reject posting rather than overwrite intervening stock. Cancel and create a new correction after investigation.
- Inventory Staff request/submit but cannot approve/post/open. Owner/Manager approve/post within current scope. Actions recheck membership, permission, branch/location/catalog lifecycle and document state.
- All-item posting, ledger/balance updates, state, audit and successful retry result commit together. Failed items leave no partial posting. Exact successful key/payload retries are safe; changed payload conflicts.

Opening is a separate positive, one-time command before any identity history, not an approval bypass. Physical observations belong to [counts](stock-counts.md). See [ledger invariants](../database/inventory-ledger.md) and [verification](../development/verification.md).
