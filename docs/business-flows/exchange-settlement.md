# Exchange difference settlement and recovery

Phase5.2 local evidence: [verification](../development/phase52-verification.md). All non-cash methods are manual; no bank API, gateway callback, automatic collection/payout or provider retry.

| Difference | Method                                             | Required evidence                                                                                   | Accounting on completion                                     |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| zero       | NONE                                               | explicit reviewed acknowledgement/note; no shift                                                    | replacement fully covered by internal credit; no cash change |
| positive   | CASH                                               | actor's OPEN same-branch/terminal shift, acknowledgement/note                                       | only positive net amount adds cash_sales                     |
| positive   | QR_MANUAL / BANK_TRANSFER_MANUAL                   | nonempty reference and acknowledgement/note; no cash shift field                                    | external amount recorded, no cash_sales                      |
| negative   | CASH_REFUND                                        | authorized refund actor's OPEN same-branch shift and available cash after reserved outgoing refunds | one linked refund/disbursement adds cash_refunds             |
| negative   | MANUAL_BANK_REFUND / MANUAL_ORIGINAL_METHOD_REFUND | authorized refund actor, nonempty reference and acknowledgement/note                                | one linked confirmed manual refund, no cash_refunds          |

Cashier can acknowledge/complete a positive/zero own exchange after approval, but cannot acknowledge **or complete** negative refunds or complete reversals. Negative completion rechecks current Owner/Manager authority before cached replay, including after demotion. Owner/Manager remain branch scoped. Cash posting requires the acknowledging actor to own the shift; shift-owner reassignment is not implemented.

## Ambiguous network response

- Preserve the UUID command key and request fingerprint. Query server status first; a repeated identical command returns its durable result only after current authorization checks.
- `confirm-settlement` records operator evidence. Do not perform a second physical collection/refund if that response is lost.
- `complete` commits local Return, replacement Sale, Inventory, refund/cash/audit and operation result atomically.
- If acknowledged nonzero posting fails, SAVEPOINT rollback removes all local business effects and commits RECONCILIATION_REQUIRED plus append-only evidence. The original completion key replays that failed document; it does not automatically retry funds or stock.
- Correct the documented stock/price/capacity problem only through authorized existing operations. Refresh status/revision and issue a **new completion key**, without another `confirm-settlement`. Recovery posts once using the same acknowledgement. If acknowledgement itself is disputed, do not pretend it was cancelled: manual investigation is required.
- A zero-difference posting failure retains no external-funds risk and fully rolls back the command; same-key retry after a legitimate correction is allowed.

Unresolved acknowledged CASH/CASH_REFUND adjustments block shift close, including concurrency with normal checkout/returns. Cash availability subtracts other pending/reconciliation outgoing refunds. Successful completion uses `expected_cash = opening_cash + cash_sales − cash_refunds`; original closed shifts are never reopened or changed.

Completed payment consideration is gross replacement value split into internal credit and new external funds. Reports must not sum credit as new collection or treat replacement gross alone as net retained revenue. No production reporting/tax certification exists.
