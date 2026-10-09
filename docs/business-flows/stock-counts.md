# Stock counts — Phase 2

Implemented locally for 1–100 selected Variants at one active branch/location, including zero-baseline identities. Creation starts IN_PROGRESS directly; scheduling and a separate DRAFT state are not implemented.

`IN_PROGRESS → SUBMITTED → APPROVED → POSTED`, with cancellation before posting. Creation snapshots exact expected quantities and balance versions. Physical entries record quantity/actor/time without mutating on-hand. The assigned counter or permitted creator can save within branch scope; all observations are required before submission. Owner/Manager approve/post; recorded self-approval is allowed.

Variance is counted minus expected, calculated with exact scaled integers; zero-baseline percentage displays a dash. Posting validates every snapshot version before movements. Changed stock returns conflict with no partial balance/ledger/state changes. Cancel and create a new snapshot/recount; no blind refresh or force-post exists.

Successful posting writes only nonzero COUNT_CORRECTION deltas, balances, state, audit and retry result atomically. Exact successful retry returns stored JSON; changed payload conflicts. No distributed/sensor counting, automatic discrepancy repair or valuation is claimed. See [inventory architecture](../architecture/inventory.md), [ledger invariants](../database/inventory-ledger.md) and [verification](../development/verification.md).
