# Exchange and reversal schema — migration000009

Readiness requires exact clean version9. Migrations000001–000008 are unchanged. [Fresh-chain acceptance](../development/phase52-verification.md) uses retained isolated scratch databases, never the primary volume.

## Ownership and fields

`sale_adjustments` owns kind EXCHANGE/REVERSAL, tenant/branch, durable ADJ number, original_sale_id, unique linked_return_id and optional replacement_sale_id/terminal_id. It records reason, revision, created/approved/reported/completed actors/times, return_credit, replacement_total, signed net_difference, replacement_items JSONB snapshots, settlement method/shift/reference/note, failure_code and inventory operation_id. Return items remain in `customer_return_items`; no parallel Return allocation table.

`adjustment_settlement_events` contains append-only ACKNOWLEDGED/RECONCILIATION_REQUIRED/COMPLETED actor/reference/note/time evidence. This is operator evidence, not a gateway event ledger. Organization audit retains successful commands.

POS additions: `pos_checkouts.adjustment_id`, checkout/payment `credit_amount`, recorded method EXCHANGE_CREDIT for fully credit-funded replacement Sales. Ordinary checkout input still allows only CASH/QR_MANUAL/BANK_TRANSFER_MANUAL. Existing `sale_payments.amount` remains external funds; normal Sales have credit0. Original Sales/payment/receipt snapshots are not rewritten.

## Invariants

- NUMERIC(18,2) amounts, existing NUMERIC(18,3) quantities and exact Go money; difference equals replacement_total minus return_credit.
- Composite tenant/branch FKs bind original/Return/replacement/terminal; shift and Inventory operation bind tenant. Unique linked Return/replacement Sale prevents orphan/double linkage; partial unique active reversal index prevents duplicate active full-sale requests.
- Replacement gross must be positive for EXCHANGE; REVERSAL has replacement_total0/no replacement Sale/no replacement items. Historical credit and item eligibility use existing Return guards; approved snapshots cannot be silently changed.
- Acknowledgement constraint closes PostgreSQL CHECK/NULL ambiguity: method/evidence/status are explicitly consistent. Cash methods require shift; noncash reference is required; direction selects allowed collection/refund/NONE methods.
- Transition/history guards enforce revisions and immutable created/approved/reported/completed evidence. Completed/Rejected/Cancelled documents and settlement events cannot be rewritten. Runtime has no DELETE/TRUNCATE; events also have no UPDATE.
- Deferred accounting checks validate completed Return/adjustment operation linkage, approved replacement quantities/prices/totals against actual Sale items, exact applied credit/external amount and net refund. `sale_payments.amount + credit_amount = sales.grand_total`; completed shift constraints preserve totals and unresolved-cash close blocking.
- Both new tables ENABLE/FORCE RLS with transaction-local app.organization_id, default empty on missing context. `smartpos_runtime` is non-owner/non-superuser/non-BYPASSRLS; no direct Stock Balance write grant. Application membership/RBAC/branch checks remain required; RLS is not a replacement for them.

History indexes cover tenant/branch/created time/id and original Sale/status. API lists use bounded pagination and scoped queries, not unbounded history scans. Organization-level serialization stays enabled across Returns/POS/Inventory/purchasing/shelves; production throughput has not been certified.

## Verification and rollout limits

`node scripts/check-phase52-migrations.mjs` verifies zero-table scratch, official sequential1–9/clean tracker, rerun no change and seven rollback-only SQL suites; retains scratch and checks existing isolated DB counts/tracker unchanged. Test-stack guard synchronization after an early development application is transparently recorded in the acceptance report, not claimed as applying edited migrations through a rerun.

Migration9 is forward-only; do not run down/drop/delete volumes. This task does not authorize applying schema9 to a persistent primary/production database. Such rollout requires a separate approved backup/compatibility/rollout plan. No batch/expiry/loyalty/promotion/tax engine is included.
