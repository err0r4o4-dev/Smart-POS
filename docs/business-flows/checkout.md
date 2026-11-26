# Checkout - Phase 3 target

1. Authenticate session, tenant, branch and active register shift. Validate CSRF, permissions and bounded cart input.
2. Resolve catalog/pricing server-side. Exact money totals; explicit promotion/discount precedence and approval requirements. Client prices are not authoritative.
3. Claim tenant/actor/operation idempotency key with request hash. Repeated same payload returns recorded result; changed payload conflicts.
4. For cash, validate tender/change and state. External payments require provider reconciliation; never hold SQL locks across network calls.
5. In one transaction lock/conditional-decrement eligible stock, enforce stock policy, create immutable sale/items/payment state, append movements, update balances, persist idempotency result/outbox/receipt data.
6. Commit once, then render receipt from persisted snapshot. Printer/AI outage must not duplicate or undo a committed sale. Retry returns same receipt.

Tests: duplicate submits/callbacks, unauthorized overrides, insufficient stock, concurrent checkouts, failed commit rollback, exact tax/rounding, payment mismatch, expired shift, tenant/branch denial. Phase 0 does not implement checkout.
