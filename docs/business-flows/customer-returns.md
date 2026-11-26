# Customer returns (Phase 5.1)

Implemented locally at `/pos/returns`; see [architecture and limits](../architecture/business-operations.md) and [verification](../development/phase5-verification.md).

1. Select an authorized organization and branch. Search an original completed sale by number or select it from available history.
2. Load immutable sale-item snapshots, original paid amounts, previously committed returns and remaining returnable quantities.
3. Enter positive exact quantities, a required reason and an inspected disposition/destination for each selected line.
4. Create an immutable draft. The backend computes historical cumulative allocations; current catalog prices are irrelevant.
5. Submit for approval. An authorized Owner/Manager may approve or reject; self-approval is permitted and recorded. Cashiers cannot approve.
6. Complete the approved document with its revision and idempotency key. Membership, branch, source sale, cumulative return quantity, allocation, destination and managed shelf capacity are revalidated.
7. One transaction posts any SALE_RETURN movements through Inventory, creates the pending refund, marks the document completed and records audit/operation output.
8. Read or print the acknowledgement and follow the linked refund. An acknowledgement is not a legal tax document or independent proof of payment.

## Failure and recovery

- Over-return, stale revision/allocation, inactive branch/location, invalid disposition or full/inactive/unassigned managed shelf returns a conflict without partial effects.
- A rejected multi-line posting leaves no movement, balance/version change, refund or successful operation key, and does not consume returnable quantity.
- Cancel/recreate a draft to change immutable lines or a stale quote. For a full shelf, use an inspected authorized warehouse on a new request or have authorized staff correct capacity/configuration before retrying.
- A timeout is not proof of failure. Reload the document and reuse the same operation key/payload; do not create a second return blindly.
- NO_STOCK_RETURN cannot specify a destination and cannot increase Inventory. Damaged/quarantine stock cannot silently be posted to a sellable location.
- Aggregate stock is not batch provenance. Automated expiry/recall protection is pending Phase 5.6.

## Tested boundaries

Full and multiple partial returns, over-return denial, historical snapshots, fractional rounding, concurrent completion, changed-key/payload rejection, rollback/retry, four dispositions, tenant/branch/RBAC/CSRF, runtime RLS and ledger reconciliation are covered by the real isolated suites. Managed-shelf tests cover concurrent capacity exhaustion, no orphan refund, inactive assignment/shelf denial, unassigned variant denial and same-key recovery after an authorized capacity change.
