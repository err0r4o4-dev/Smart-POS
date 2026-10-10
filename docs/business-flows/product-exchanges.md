# Product exchanges — Phase5.2

Status: **COMPLETED (Local)**, 2026-10-10. [Acceptance evidence](../development/phase52-verification.md). Phase5 overall remains PARTIAL.

## Operator workflow

1. Open `/pos/exchanges` in the authorized organization/branch; find the original completed Sale. Cashier visibility remains own-Sale scoped.
2. Select one or more original item quantities and inspected dispositions/destinations. The server calculates returnable quantities including completed normal Returns and Exchanges; a draft is not a stock reservation.
3. Select an active same-branch terminal and replacement variants/quantities. Its own OPEN shift and explicit saleable stock source are required. The server quotes current authoritative prices, not client prices or a fallback warehouse.
4. Save/edit DRAFT with the expected revision; submit; Owner/Manager approves or rejects within branch scope. Approved price/quantity/disposition snapshots cannot be edited.
5. Review historical credit, replacement gross and signed net difference. Explicitly acknowledge the allowed payment/refund method with note/reference/own shift as appropriate; zero uses NONE. Acknowledgement is operator evidence, not bank verification.
6. Complete through the existing Return/POS/Inventory transaction. Read back the durable result after uncertainty; never accept/refund money again merely because a browser request timed out.
7. Open original Sale, linked Return and replacement Sale; inspect movement IDs, settlement events and audit timeline. Print/reprint the committed acknowledgement without reposting anything.

## Exact money and stock

Money travels as decimal strings; backend uses integer/big-integer exact arithmetic. Historical credit uses cumulative allocation `floor(P × (R + q) / Q) − F`, including the final remainder, where P is the original paid line consideration, Q sold quantity, R completed returned quantity and F already allocated credit. Current product prices never recalculate original consideration.

`net_difference = replacement_total − return_credit`. Replacement applied credit is min(return credit, replacement total). `sale_payment.amount + sale_payment.credit_amount = replacement_sale.grand_total`; amount means new external funds only. For100 credit and150 replacement, credit100/external50, not new cash150. For100 credit and80 replacement, credit80/external0/refund20. Existing POS has no discount/separate tax/loyalty allocations; Phase5.3 must preserve historical allocations before extending this formula.

Return stock uses RESTOCK_SELLABLE/QUARANTINE/DAMAGED/NO_STOCK_RETURN and Phase5.1 managed-shelf assignment/capacity rules. Replacement deducts only the terminal's authorized warehouse/sales-floor/shelf source, never quarantined/damaged/in-transit stock. No negative balances or alternate-warehouse fallback. Return, replacement Sale/receipt/payment, ledger, cash totals, audit and operation result commit together.

Price/eligibility/stock/returnability are checked again when posting. Organization-level serialization is preserved. No FEFO, batch identity, expiry or recall automation is claimed.

## State and recovery

`DRAFT → PENDING_APPROVAL → APPROVED → AWAITING_SETTLEMENT → COMPLETED`; REJECTED/CANCELLED only before acknowledged money. Nonzero acknowledged posting failure becomes RECONCILIATION_REQUIRED with no committed business side effects; [recovery instructions](exchange-settlement.md). Zero-difference posting failure rolls back and may retry after correcting a legitimate stock/capacity issue.

Every mutation requires session, tenant/branch permission, CSRF/Origin, UUID Idempotency-Key and expected revision. Same-key/same-payload replay reauthorizes and returns the recorded result; changed payload conflicts. Context-bound caches/forms prevent org/branch data leakage.

Browser printing is not physical-printer support or a compliant tax invoice. It cannot reverse a committed exchange; reprint cannot move stock or money.
