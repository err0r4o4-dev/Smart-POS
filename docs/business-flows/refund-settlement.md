# Refund settlement (Phase 5.1)

Implemented locally at `/sales/refunds`. A completed physical return creates exactly one PENDING_SETTLEMENT refund; it does not automatically pay the customer.

```text
PENDING_SETTLEMENT → SETTLEMENT_REPORTED → CONFIRMED
                              ↓               ↑
                    RECONCILIATION_REQUIRED ──┘
```

## Manual evidence

Owner/Manager with the settlement permission and branch access selects the explicit method, enters a note/reference and acknowledges the external boundary. MANUAL_BANK_REFUND and MANUAL_ORIGINAL_METHOD_REFUND require a reference and no register shift. Keep any external payment evidence securely; do not put bank credentials or unnecessary account/card information in notes.

Reporting stores actor/time/reference as immutable evidence and appends an event. Confirmation separately records reviewed evidence; reconciliation records unresolved uncertainty instead. CONFIRMED is an operator assertion, not bank/gateway verification. The application never calls a payout provider.

## Cash accounting

CASH_REFUND requires the reporter's own OPEN same-branch shift and sufficient expected cash after pending reported refunds. Confirmation requires ownership of that selected shift and creates one immutable `register_cash_disbursements` row. The database posting trigger updates current cash refunds/expected cash atomically. Duplicate confirmation cannot deduct twice.

The original sale/receipt/payment and closed selling shift are unchanged. Use a current authorized shift for a later refund. Reported/reconciliation refunds block closing the selected shift. There is no shift-owner reassignment recovery workflow; do not work around an unavailable owner by editing database rows or falsifying settlement.

## Timeout / uncertain payout

Reload the refund, retain the real external reference and retry the same idempotency key/payload when necessary. A locally failed request is never a reason to execute another bank transfer. PostgreSQL cannot atomically include an external payout. Use reconciliation if evidence is uncertain; do not confirm solely to clear a blocked shift.

Events, cash disbursements and completed refunds are immutable; corrections must not erase existing evidence. The printed acknowledgement includes document/source/branch/actor/time/evidence and is not a tax receipt or bank settlement certificate.
