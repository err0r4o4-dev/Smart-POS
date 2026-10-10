# Sale cancellation and compensating reversal

Phase5.2 **COMPLETED (Local)**; [evidence](../development/phase52-verification.md).

## Uncommitted checkout

Use the existing POS cancellation workflow at `/pos/checkout`, not an adjustment pretending a Sale exists. A checkout that has not confirmed external funds can be cancelled without a completed Sale or stock posting. A confirmed/reconciliation checkout cannot discard funds evidence using cancellation; existing POS reconciliation policy applies. No completed Sale is deleted.

## Completed Sale

`/sales/voids` creates a kind REVERSAL adjustment linked to a full inspected Return. A privileged branch-scoped actor approves, explicitly acknowledges an authorized refund and completes the compensating transaction. The UI calls it a completed-sale reversal, not deletion of the original receipt.

Conservative policy: reject an original Sale with a prior completed customer Return, Exchange or Reversal; reject duplicate active reversal and incomplete original-item allocation. No residual-value partial-sale reversal is implemented. Pending normal Returns/Exchanges do not reserve quantity; posting revalidates completed allocations under the existing organization lock, so a race cannot double-credit.

The original Sale/items/payments/receipt, quantity and financial snapshots remain unchanged. Related-document projections may grow; this does not mutate historical consideration. Reversal creates inspected SALE_RETURN stock where applicable and one linked refund; NO_STOCK_RETURN creates no stock. There is no replacement Sale and replacement_total is0. Closed original shift remains immutable; a cash refund uses the current authorized actor-owned OPEN shift and available cash.

REVERSAL uses the same DRAFT/approval/settlement/recovery/idempotency lifecycle as Exchanges. Cashier can request/read own documents but cannot approve/settle/complete a reversal. Role revocation and cross-branch/tenant access are checked before retries. Completed documents/events cannot be edited/deleted by runtime.

Print the committed acknowledgement and open the original Sale/linked Return/audit. Print failure or reprint cannot reverse or repost money/stock. Manual refund is operator-confirmed evidence, not independent bank proof; tax invoices, hardware, batch/expiry and recall controls are outside this slice.
