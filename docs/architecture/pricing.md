# Pricing & Promotions — Phase 5.3

## Boundaries and ownership

The existing Go modular monolith owns pricing. `internal/modules/pricing` resolves price lists, evaluates promotions, requests/decides manual discounts and commits redemptions through the caller's authorized PostgreSQL transaction. Organization owns RBAC/tenant context; Catalog owns variants/categories; POS owns carts/checkouts/Sales/receipts/shifts; Returns owns historical credits and Inventory owns physical posting. There is no second checkout, stock engine, executable expression evaluator or new service.

Canonical inventory remains **16 modules / 106 planned routes**. Operational pricing pages are `/pricing`, `/pricing/lists`, `/promotions`, `/promotions/:id` and `/discount-approvals`. React uses the existing Golden Amber components, Inter/Noto Sans Thai, TH/EN selectors and tenant-keyed TanStack Query caches. See [acceptance evidence](../development/phase53-verification.md) for actual gate status.

## Authoritative resolution

- An eligible ACTIVE branch price list precedes every organization-wide list. Within each scope: descending priority, then ascending UUID. Otherwise use Catalog's selling price. Starts are inclusive and ends exclusive, evaluated by PostgreSQL statement time.
- Definitions follow `DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE ↔ PAUSED`. Only Draft content is editable; every mutation checks the exact revision and records an organization audit event. Owner controls organization-wide definitions; Manager is restricted to assigned active branches.
- Promotion rules are bounded typed JSON: PERCENTAGE in basis points, FIXED, BOGO and MINIMUM_SPEND. Branch/effective windows and intersecting variant/category eligibility are server-validated. Zero usage_limit means unlimited.
- STACKABLE rules run by descending priority/UUID against remaining eligible net amounts. EXCLUSIVE and BEST_DISCOUNT_ONLY are single-rule alternatives evaluated against gross eligible amounts. Compare the best single candidate with the complete stack; larger total discount wins. A tie retains the stack; single-candidate ties retain priority/UUID order. No rule can discount an ineligible line or exceed its remaining amount.
- Fixed/percentage/manual amounts use integer cents and big-integer intermediates. Largest-remainder allocation uses variant UUID order as the stable tie-break. All allocated line discounts sum exactly to the quote discount. BOGO counts whole physical units, discounts cheapest eligible units and never removes free units from Inventory deduction. Fractional units do not count toward BOGO groups.

## Quote and checkout lifecycle

`GET /pos/carts/{resourceId}/quote` is the authoritative cart quote, optionally with approval_id. Quote revision hashes material lines, prices, list revisions, applicable promotion revisions/allocations and approved manual allocation. Catalog/cart/pricing changes invalidate affected quotes. Held carts are revalidated and require explicit review instead of silently accepting a different price.

Checkout retains prepare → explicit funds acknowledgement → complete. Prepare validates the current quote, cart revision, expected total, tender and optional pricing_revision; omission of pricing_revision remains supported for earlier API clients, but totals/eligibility still come from the server. Confirm and complete revalidate pricing. After acknowledgement, a mismatch never changes charged consideration: business posting rolls back to the savepoint and durable RECONCILIATION_REQUIRED evidence remains.

A zero-payable quote uses internal `NONE`, immediately prepares a CONFIRMED no-funds checkout and skips the funds acknowledgement UI. The existing one-settlement-per-Sale contract stores an explicit NONE settlement snapshot with amount/received/change/credit_amount all zero. This is not a fake CASH/bank receipt or provider acknowledgement; no cash is added. The method is excluded from the operator tender selector and can only be used for a zero total.

Completion commits immutable Sales/items/pricing snapshots, exact net allocations, receipt, physical Inventory movements, optional approval consumption and promotion redemptions in one transaction. Duplicate calls return the same Sale without repeating payment, usage or stock. Organization serialization and row locks protect finite usage limits; redemption insert triggers increment usage and deferred constraints reconcile usage/redemptions/Sale allocations. Failed posting consumes neither redemption nor approval.

## Manual approvals and historical consideration

Cashier requests an exact amount/reason for their own active cart. Owner/authorized Manager decides; approval expires after 15 minutes and binds requester, tenant, branch, cart revision and base pricing revision. Current approver membership/account/role/branch authority is rechecked before applying an approval and before sensitive checkout cache replay. Stale, expired, foreign, forged and revoked approvals cannot authorize settlement. CONSUMED approval is immutable and uniquely linked to one Sale.

Refunds continue allocating historical `sale_items.line_total`, now the net-paid amount, rather than current prices. Exchanges reuse historical return credit and the same pricing service for current replacements. Original Sale snapshots remain untouched; reversal compensates existing history and does not rewrite promotional redemption usage. Refunded/reversed promotions therefore do not replenish usage limits; they measure committed redemptions, not currently retained revenue.

## Database and API

Forward-only migration `000010_pricing_promotions.up.sql` adds price_lists, promotions, discount_approvals and promotion_redemptions, JSON definition snapshots, quote revisions and generated gross/net allocation constraints. Existing migrations 1–9 are unchanged. Four tables have ENABLE/FORCE RLS and tenant-safe references; runtime has no DELETE grant and cannot update redemptions. Readiness requires exact clean schema **10**.

Organization-scoped API groups: `/pricing/lists`, `/promotions`, `/discount-approvals`, plus cart quote and additive POS pricing fields. OpenAPI documents all 16 new paths, NONE settlement semantics and exact decimal strings. Errors reuse existing 400/401/403/404/409/503 envelopes; mutations retain session/Origin/CSRF checks. Discount requests require a UUID Idempotency-Key; definition transitions use optimistic revisions rather than operation-cache replay.

## Limits

THB, existing catalog/tax treatment, manual payment evidence and existing authorization model remain in force. No loyalty/customer/batch features, external payment gateway, new tax engine or production deployment is included. Approval queues are bounded to 200 rows; definition lists are currently unpaginated, so a large-scale paginated administration workflow is not claimed. Production load, dedicated runtime LOGIN, TLS/secrets, approved primary migration/backup/restore and hardware/accessibility certification remain separate gates.
