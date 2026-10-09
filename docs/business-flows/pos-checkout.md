# Cashier checkout and reconciliation

1. Select an authorized organization, branch and active terminal with an explicitly configured sale location.
2. Open your own shift with opening cash. A terminal and cashier each have at most one open shift.
3. Scan a known barcode or select a catalog variant. Edit/remove/clear quantities using the current cart revision.
4. Optionally hold the cart. No stock is reserved. Resume only your own cart on its bound terminal; review current price/status/stock and explicitly accept a new price before preparing payment.
5. Prepare CASH, QR_MANUAL or BANK_TRANSFER_MANUAL with a stable UUID Idempotency-Key. The server calculates and freezes the quote; selecting a method alone never confirms money.
6. Check real funds outside the system. Acknowledge receipt explicitly; for manual methods also provide a reference. Persisted confirmation is evidence of the operator's acknowledgement, not bank verification.
7. Complete the same checkout. Local sale/payment/receipt/Inventory/cash/audit effects commit atomically. Show success only for COMPLETED.
8. Print or reprint the committed snapshot. Cancelling/failing a print dialog does not undo stock or create another sale.
9. Before closing, handle all pending attempts. Count physical cash; compare to opening cash plus net completed CASH sales. Record the difference explicitly.

## Failures and retries

| State/problem                                               | Required handling                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost prepare response                                       | Retry the same key/body, or query pending attempts for the cart; a live-cart unique constraint prevents a second payment intent.                  |
| AWAITING_PAYMENT                                            | Confirm only after checking funds, or cancel before receiving money.                                                                              |
| Lost confirmation response                                  | Query status; never ask for payment again just because the browser lost a response. Retry confirmation with the same evidence/key when available. |
| CONFIRMED                                                   | Complete the existing attempt; do not create another cart payment for the same funds.                                                             |
| Stock/price/state/database failure after funds confirmation | RECONCILIATION_REQUIRED retains reference/actor/time. No sale, receipt, ledger movement or drawer increment is committed.                         |
| Recoverable failure resolved                                | Retry completion of the same checkout; uniqueness returns the same committed sale.                                                                |
| Funds need external disposition                             | Owner/Manager verifies it outside SmartPOS and records an acknowledged resolution note. This is not an automatic refund.                          |
| Shift close races with completion                           | Pending attempts block premature close; a successful close includes the committed cash sale.                                                      |

All paths in this document are tenant-relative. The API prefix is `/api/v1/organizations/{id}`. Neither client context, a bank reference nor a role label substitutes for backend authorization.
