# Business operations - Phase 5

## Delivery boundary (2026-10-10)

Phase 5 overall is **PARTIAL**. Phase 5.1 Returns/Refunds passed its scoped local acceptance; Phases 5.2–5.6 are not implemented and Phase 5.7 is partial regression/security evidence, not acceptance of those missing features. Phase 6 is NOT STARTED and NOT READY. See [actual verification](../development/phase5-verification.md).

The canonical inventory stays at 16 modules / 106 planned routes. Only `/pos/returns` and `/sales/refunds` are newly implemented. No exchange, void, promotion, customer, loyalty or quality page is registered as operational.

## Implemented ownership

- `returns` owns customer-return documents, historical consideration allocation, approvals and explicit refund-settlement evidence.
- Organization owns active membership, fixed permissions and branch authorization. Every read, mutation and replay rechecks them.
- POS owns immutable sales/items/payments/receipts and register shifts. Returns do not edit or delete a completed sale or reopen a closed shift.
- Inventory owns the only stock ledger and balance projection. `PostCustomerReturn` inserts `SALE_RETURN` through that existing posting path, never direct balance writes.
- The shared organization row lock serializes commands against returns, POS, purchasing, shelf configuration and Inventory. This is a correctness boundary, not a demonstrated high-throughput design.

## Return state and quantity policy

`DRAFT → PENDING_APPROVAL → APPROVED → COMPLETED`; pending approval may be rejected; draft/pending/approved may be cancelled. Terminal documents are immutable. There is no separate RECEIVED state: authorized completion records physical disposition and stock posting together.

Lines are immutable even in draft; cancel/recreate to change inspection, destination or a stale historical quote. Only COMPLETED returns consume original sold quantity. Outstanding drafts do not reserve stock or return rights. Creation and completion check cumulative committed returns; concurrent completions cannot over-return. An intervening completed return can invalidate a quote and cause HTTP 409.

For original sold quantity `Q`, historical paid line total in minor units `P`, already returned quantity `R`, previously allocated refund `F`, and new quantity `q`:

```text
new refund = floor(P × (R + q) / Q) − F
```

Quantities use exact thousandths; money uses exact cents and Go big integers. A final full return receives the rounding remainder. A sold quantity of 1.500 with paid total 0.02, returned as three 0.500 operations, allocates 0.00 / 0.01 / 0.01. Current catalog prices never determine a refund. Existing POS has zero discount/separate-tax allocations; future pricing/loyalty must persist historical allocations before those capabilities can be claimed supported.

## Stock inspection

| Disposition      | Required destination                               | Posting                            |
| ---------------- | -------------------------------------------------- | ---------------------------------- |
| RESTOCK_SELLABLE | Active same-branch WAREHOUSE, SALES_FLOOR or SHELF | Positive SALE_RETURN               |
| QUARANTINE       | Active same-branch QUARANTINE                      | Positive SALE_RETURN; not saleable |
| DAMAGED          | Active same-branch DAMAGED                         | Positive SALE_RETURN; not saleable |
| NO_STOCK_RETURN  | None                                               | No movement                        |

If the destination is registered as a managed shelf, posting requires an ACTIVE shelf, an ACTIVE assignment for that variant and recorded quantity plus return not exceeding configured capacity. The check occurs inside the authorized Inventory transaction, including retries. A full/inactive/unassigned shelf rejects atomically; a new inspected document can use an authorized warehouse instead. This is a return-path guard, not a claim that capacity is a database invariant for every legacy Inventory adjustment.

Disposition is operator inspection, not automated expiry/recall validation. There are no batch identities, FEFO, expiry, recalls or write-offs yet. Never infer verified physical provenance from a sale's aggregate variant/location ledger.

## Refund boundary

Completion atomically commits return, matching Inventory postings, one pending refund, audit and operation result. It does **not** transfer money. Refund flow is `PENDING_SETTLEMENT → SETTLEMENT_REPORTED → CONFIRMED`, with explicit `RECONCILIATION_REQUIRED` from reported/reconciliation states before confirmation. Settlement events are append-only.

Methods are CASH_REFUND, MANUAL_BANK_REFUND and MANUAL_ORIGINAL_METHOD_REFUND. Non-cash methods need a reference and operator acknowledgement; CONFIRMED means the authorized operator reviewed evidence, not independent bank verification. No gateway callback, bank API, automatic payout or automatic external retry exists.

Cash reporting binds the actor's own OPEN same-branch shift and checks available cash after other reported/reconciliation refunds. Confirmation creates one immutable cash disbursement; the existing shift updates `cash_refunds` and `expected_cash = opening_cash + cash_sales − cash_refunds`. Reported/unreconciled cash refunds block closing. A later return uses a current authorized shift rather than rewriting the original closed shift. The confirming actor must own the selected shift; reassignment/recovery for an unavailable shift owner is not implemented.

## Authorization and replay

Owner/Manager can approve and settle in their branch scope; self-approval is explicitly permitted and audited. Cashiers may create/read/complete only their own return requests and read related refunds, but cannot approve or settle. Inventory staff and viewers have no return-write permission. Cashier original-sale visibility is limited by the existing POS ownership policy.

Operation keys bind organization, actor, action, resource, input fingerprint and revision. Authorization and branch checks happen before cached results. Identical successful retries return the committed result; changed payloads conflict. Failed posting rolls back the operation record and every local side effect, permitting the same key to retry after a legitimate capacity correction. Strict JSON/body limits, bounded lists, context deadlines and existing CSRF/Origin middleware remain in force.

## Unimplemented next subphases

- **5.2 Exchanges/Voids:** must durably link return and replacement checkout, settle only the authorized difference, prevent orphan documents and preserve closed accounting. Current POS constraints require full-price consideration; two unrelated operations are not an exchange. Uncommitted checkout cancellation already exists, but is not a completed-sale void.
- **5.3 Pricing/Promotions:** no price lists, scheduling/stacking/usage limits, approvals or checkout discount allocations. Catalog remains the authoritative price source.
- **5.4 Customers:** no customer CRUD/groups, consent, privacy lifecycle or sale linkage.
- **5.5 Loyalty:** no points ledger, earning/redemption or refund reversals; no loyalty double-spend assurance is claimed.
- **5.6 Batch/Quality:** no tracked/untracked allocation, batch balances, FEFO, expiry, recall blocking or write-off posting across all inventory paths.

Migration 8 has already been applied to isolated databases and contains Returns/Refunds only. Do not append future tables to that file and assume an existing database will change. Follow-up schema changes require forward-only migrations, explicit version/readiness updates and renewed fresh-chain testing. Do not migrate the persistent primary database as part of acceptance.
