# Loyalty & Rewards — Phase 5.5

Phase 5.5 extends the canonical Customers module; it does not introduce a seventeenth module or a second settlement engine. Two operational routes are `/loyalty` and `/loyalty/history`. See [local acceptance](../development/phase55-verification.md).

## Programs and accounts

An organization has at most one ACTIVE program. Rules define exact decimal THB `spend`, integer `earn_points` and exact THB `point_value`. Programs and accounts support revisioned activation/suspension. A Customer has one organization-shared account linked to its enrollment program. Reassigning an existing account to a different program is not supported; suspension preserves its ledger and history.

`loyalty_programs`, `loyalty_accounts` and `loyalty_ledger` are PostgreSQL-backed. Composite organization FKs reject foreign Customer/program/branch/Sale/Return/operation references. All three tables use FORCE RLS. The runtime role has SELECT/INSERT/UPDATE on rules/accounts, only SELECT/INSERT on the ledger, and no DELETE/TRUNCATE grants. Ledger UPDATE/DELETE also has an immutable trigger.

## Permissions and history

Owner/Manager have `loyalty.read`, `loyalty.manage`, `loyalty.enroll`, `loyalty.adjust`, `loyalty.redeem`; Cashier has read/enroll/redeem only. Non-Owners require assigned branches. This is an explicit organization-shared program/account policy, not branch-owned membership. Ledger history is restricted to authorized branches for non-Owners; an explicit unauthorized branch filter is denied.

The service obtains current organization authorization before reading or replaying mutation results. Adjustments require a valid active branch, a nonzero bounded integer and a reason. Audit and idempotent operation results commit together. Names, account state and history are visible only through the corresponding tenant permissions; contact details are not copied into Loyalty.

## Authoritative balances and reservations

`balance = SUM(loyalty_ledger.points)`; there is no mutable points-balance table. API balances and ledger points are decimal strings, while command points are bounded integers. Each posting is limited to ±1,000,000,000,000 points. Monetary calculations reuse exact integer cents and pricing allocations.

`available = MAX(0, balance - unresolved checkout reservations)`.

Checkout preparation locks the account and reserves points in the existing pricing snapshot, but does not spend or earn. Cancel releases the reservation. Completion revalidates account/program/Customer availability and current permission. Shared organization serialization, account locks and a database reservation guard prevent two pending checkouts spending the same points. Negative authorized adjustments cannot use reserved points.

## Sale settlement and reward pricing

Only committed Sales attached to an ACTIVE Customer/account/program earn points:

`earned = FLOOR(committed Sale grand_total / program spend) * earn_points`.

Walk-in Sales do not enroll automatically or earn points. Returns, drafts, pending checkouts and payment acknowledgement alone do not earn. A zero-payable Sale earns zero.

`GET /pos/carts/{resourceId}/quote?loyalty_points=N` and checkout's optional `loyalty_points` use the backend's account/rule selection. Client totals or reward snapshots are not authoritative. Rewards are discounts, not payment instruments. They cannot stack with a promotion or a manual discount approval. Exact full redemption uses the existing `NONE` zero-payment settlement; it never invents external funds.

Sale creation, Inventory posting, REDEEM/EARN entries, cash/receipt, audit and operation result all use the existing settlement transaction. A failed posting rolls back business effects; acknowledged funds remain subject to the established reconciliation process. Unique Sale/kind and Return/kind indexes prevent duplicate postings. The deferred Sale consistency trigger checks the reward reference and exact redemption posting.

The REDEEM snapshot freezes account, program revision, point value, integer points and exact discount. The EARN snapshot freezes earning rules, eligible net total and reversal/debt policy. Later rule changes do not revalue historical postings.

## Returns, refunds, exchanges and reversals

Points compensation occurs at committed Return posting, not again at refund acknowledgement. Existing inspected stock disposition and refund accounting remain authoritative.

For earning, the cumulative target is the original earned points multiplied by cumulative returned historical net value / original Sale net value, rounded down. For redeemed points, allocation uses cumulative returned historical gross value / original Sale subtotal, rounded down. Each Return posts only the difference from all prior compensations; the final complete Return restores exactly the original points. A zero-total Sale has zero earning to reverse, but can still restore redeemed points.

If earlier earned points have already been spent, EARN_REVERSAL may produce a signed ledger debt. Available remains zero; future earning or authorized positive adjustment first offsets that debt. Redemption cannot spend negative available points. This is a deliberate policy, shown in TH/EN UI, not a silently discarded reversal or negative spendable balance.

Exchanges and sale reversals reuse existing Return compensation. A replacement Sale earns only if its inherited Customer/account/program is currently eligible; historical replacement Customer linkage is not rewritten. Replacement credit is not new money and no new payment path is introduced.

## API/UI and limitations

Program list/create/update, account list/enroll/status update, adjustment and paginated history expose six path templates/eight operations. Mutations require Origin/CSRF and `Idempotency-Key`. Strict DTOs reject client-controlled server fields. Frontend query keys contain user, organization, branch and permission scope; invalidations reuse the existing tenant cache boundary.

The UI includes program rules/status, Customer search/enrollment, balance/available/status, authorized adjustment, historical rule details and transaction links. Customer/Sale details link to Loyalty; POS redemption requires an explicitly selected Customer. Reversal history for Returns/Exchanges is obtained from actual persisted postings.

No points expiry, tiers, program reassignment, rewards gateway, production throughput guarantee or liability valuation claimed. Organization serialization prioritizes correctness, not load performance. Phase5.6 Quality and Phase5.7 final local acceptance are complete; retention, rollout/backups, real hardware/payment validation and full accessibility remain separate production gates. See [final evidence](../development/phase57-verification.md).
