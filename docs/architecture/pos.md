# POS and sales - Phase 3

Current Phase5.1–5.3 extension: Returns/Refunds and Exchanges/Voids reuse immutable POS history and current-shift accounting. This Phase5.1–5.3 checkpoint required clean schema10; current Go readiness requires clean schema23. Pricing supplies authoritative scheduled prices/promotions, manual approvals and immutable gross/discount/net snapshots; replacements use current pricing while refunds/credits use historical net-paid allocations. `credit_amount` is not external funds; ordinary input/UI cannot choose EXCHANGE_CREDIT. Zero-payable uses internal NONE with zero amounts and no funds acknowledgement. Changed acknowledged quotes require reconciliation, never silent repricing. See [pricing](pricing.md), [business operations](business-operations.md) and [latest acceptance](../development/phase53-verification.md). Phase3 statements below are historical except the current register formula.

Local implementation, verified on 2026-10-10; not a production release. The work started with the 2026-10-09 execution context. Go remains a modular monolith with Chi/pgx, PostgreSQL remains the only transactional database, and React/TanStack Query remains the frontend. No gateway, microservice, AI or Phase 4 functionality is added.

## Terminal and stock-source policy

- A terminal belongs to one organization and branch and identifies exactly one active stock location in that branch.
- Only WAREHOUSE, SALES_FLOOR or SHELF is eligible. QUARANTINE, DAMAGED and IN_TRANSIT are never sale sources.
- The configured location is deducted; parent/child navigation does not aggregate stock, and no warehouse fallback or automatic replenishment occurs.
- Terminal management requires `pos.terminal.manage` (Owner/Manager). Cashier access follows assigned active branches. Terminal reassignment is blocked while it has an open shift or an active/held cart.
- Availability means recorded stock, not a verified physical shelf count.

## Cart and price authority

`ACTIVE -> HELD -> ACTIVE`, `ACTIVE -> COMPLETED`, and active/held cancellation are persisted. Carts remain cashier-owned and terminal-bound; another cashier cannot claim them. Holds do not reserve stock. A revision check prevents stale item edits/resume claims. At most 100 distinct variants are accepted.

Products/variants/barcodes/units are read through the existing catalog transaction. Money and quantities cross the API as decimal strings. Money uses integer cents with big-integer multiplication; quantities use three decimal places. HALF_UP rounding occurs per line before integer total accumulation. COUNT/PACKAGING quantities must be integral. THB, positive selling prices and active product/variant/unit are required. Discounts and separate tax calculation are not enabled.

Reading/resuming a cart displays current prices/status/availability alongside the prior quoted price. Changed prices require an explicit cart update before payment preparation. Client-submitted prices, stock locations or totals are never used as posting authority; `expected_total` is only a stale-quote check.

## Payment and transaction boundaries

1. `POST /pos/checkout` freezes a validated cart and saves an AWAITING_PAYMENT quote. A UUID Idempotency-Key and payload fingerprint define the request.
2. `POST /pos/payments/{resourceId}/confirm` requires explicit `acknowledged=true`. CASH requires sufficient tender; manual QR/transfer requires an operator-supplied reference and exact tender. The server saves actor/time/key/reference and CONFIRMED state in a separate committed transaction.
3. `POST /pos/checkouts/{resourceId}/complete` revalidates shift, terminal, stock, product state and price. Within one transaction it creates sale/items/payment/receipt, posts existing Inventory SALE ledger movements, updates ledger-derived balances, increments net cash sales, completes cart/checkout and records audit.

Completion uses a SAVEPOINT. Any failure after confirmation rolls back all local sale/ledger/cash effects but persists RECONCILIATION_REQUIRED and its failure code. Payment evidence is not erased or automatically refunded. Retry can finish the same confirmed attempt after a recoverable stock/database failure. A changed price must not silently change the charged quote.

AWAITING_PAYMENT can be cancelled; confirmed funds cannot. Owner/Manager can record `acknowledged=true` plus a resolution note only after verifying funds disposition outside SmartPOS. RESOLVED does not mean an automatic refund, gateway verification or bank settlement.

## Concurrency and history

The existing authorized organization transaction locks the organization row. Inventory commands and POS therefore share serialization; terminal/shift/cart/checkout rows are also locked, and ledger triggers lock stock identities and reject negative balances. Variant posting order is deterministic. This favors correctness at local throughput; production capacity testing is still required.

Database uniqueness covers one open shift per terminal/cashier, request keys, one completed sale per cart/checkout/Inventory operation, and one payment/receipt per sale. Completed retries return the original sale even after shift closure. Closed shifts and confirmed/completed payment evidence are guarded against mutation. Completed sales/items/payments/receipts cannot be edited, deleted or appended to through the runtime role.

## Register accounting

`OPEN -> CLOSED`, with explicit opening cash and counted cash. `cash_sales` sums completed CASH totals (tender minus change), not QR/transfer amounts. Phase5.1 adds confirmed `cash_refunds`: `expected_cash = opening_cash + cash_sales - cash_refunds`; signed `difference = counted_cash - expected_cash`. Pending/confirmed/reconciliation-required checkout attempts and reported/unreconciled cash refunds block closure. A close/settlement race rejects premature close or includes the committed accounting. Refunds use a current actor-owned open shift, never reopen/rewrite the original closed shift. General cash-in/out and shared-cashier shifts remain unimplemented.

## UI and history

Operational pages: `/pos`, `/pos/held-carts`, `/pos/checkout`, `/pos/register/open`, `/pos/register/close`, `/pos/register/history`, `/pos/shifts`, `/sales`, `/sales/:id`, `/receipts`; Phase5 adds `/pos/returns`, `/sales/refunds`, `/pos/exchanges`, `/sales/voids`. `/preview/pos` is a presentation preview; tax documents remain unavailable.

POS uses the existing fonts, amber controls, cards and organization switchers. Query keys include user/organization/branch and requests support cancellation; workspace remounts on context changes. Barcode scanning uses keyboard/Enter, unknown codes never create products, and quantity controls support direct entry and touch. Held carts/register/payment/sales history use server pagination. Product browsing and terminal/location selectors are bounded; use product search/category filters for larger catalogs.

Receipts render only committed snapshots, including store/branch/cashier/product/unit/price/payment information. 58mm/80mm CSS and browser printing are supported; print failure/reprint never posts a sale. Print rules are scoped to receipt pages so Catalog labels still work. These are ordinary receipt previews, not tax invoices or certified thermal-printer integrations.

## Authorization and validation

Every endpoint is under `/api/v1/organizations/{id}` and rechecks the real session, active membership, permission, branch and ownership. Cashier reads only their own sales/receipts/shifts/checkouts/carts. Owner/Manager history spans only authorized branches; neither role can confirm another cashier's funds or settle another cashier's open shift as if it were their own. Reconciliation and closing another cashier's shift are explicit elevated permissions.

Authenticated writes retain Origin/CSRF checks, JSON-only bounded input and unknown-field rejection. UUIDs, string lengths, quantities and money are validated. Nine POS tables use FORCE RLS for organization isolation plus composite tenant/branch references. Branch/cashier isolation is application-enforced, not a claim of per-branch database RLS.

See [checkout flow](../business-flows/pos-checkout.md), [database invariants](../database/sales-transactions.md), [Thai verification](../development/phase3-verification.md) and OpenAPI for exact DTOs and endpoints.
