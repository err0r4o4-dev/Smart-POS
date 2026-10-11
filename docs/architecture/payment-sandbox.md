# Stripe sandbox connection — first implementation slice

Date: 2026-10-12. This is a development-only connection diagnostic, not the completed single-store online sales flow and not production readiness.

## What exists

- Management page `/manage/settings/storefront/payments`, linked from storefront settings. Owner/Manager must still have active membership and `storefront.manage` on every API request. Writes retain existing allowed-Origin and CSRF middleware.
- Server-only `STRIPE_TEST_SECRET_KEY`, optional and disabled by default. Only `sk_test_` keys are accepted; live/publishable keys fail startup with a sanitized message. Configured sandbox is rejected when `APP_ENV` is not `development`.
- Stripe-hosted Checkout for one synthetic THB 20.00 item. Card and PromptPay are requested; actual availability depends on the Stripe test account. No customer/order data is copied into the test payment. Scope metadata contains organization/user identifiers and the explicit sandbox purpose.
- Create/retry uses a user+organization-scoped hashed idempotency key. Browser session storage retains the pending command key and current test Session ID per user/organization. Same-key retries must be prompt: Stripe's retention is not a permanent local idempotency ledger.
- Retrieve checks test mode, object, payment mode, exact amount/currency, organization, creator, sandbox purpose and Session ID. Only an HTTPS `checkout.stripe.com/c/pay/{id}` redirect is allowed. A success URL is never proof of payment.
- Full test refunds derive the PaymentIntent and amount from the verified paid Session. Refunds use a deterministic session-scoped idempotency key and return an existing scoped refund when present. Pending, requires-action, failed and canceled refunds are not displayed as successful refunds.
- No local migrations, order changes, accounting entries, cash movements, sales, stock reservations, stock posting or fulfillment happen in these diagnostic routes. Stripe sandbox objects are the test record; no local durable payment ledger/webhook consumer exists yet.

## Local setup and test

1. Create/select a Stripe sandbox in your own account. Use synthetic contact/payment details only; do not scan a test QR expecting a real transfer.
2. Configure `STRIPE_TEST_SECRET_KEY` securely in the API process environment (or the ignored local Compose environment). Do not paste it into chat, a browser field, source control, test fixtures or screenshots. No `VITE_` payment secret is needed.
3. Run updated API/web only against an explicitly authorized development environment. Compose forwards the optional key, but changing the environment does not update an already running container. Rebuild/restart requires separate approval; this change does not run `stack:up`, migrations or deployment.
4. With an authorized management account, open `/manage/settings/storefront/payments`. “ตั้งค่า test key แล้ว” means the local key exists, not that Stripe has been contacted successfully.
5. Create the THB 20.00 test Checkout, then open the returned Stripe page. Use Stripe's documented sandbox payment flow. Returning without paying must remain unpaid.
6. Use “ตรวจสถานะรายการใหม่” to retrieve provider status. Checking a test Session created by another user/organization/purpose must fail; changing the URL cannot make it paid.
7. After a successful test payment, explicitly confirm the full test refund. Refresh provider status; pending/requires-action must remain distinct from succeeded. PromptPay refund completion may require further provider-side action.
8. Inspect the test objects in the Stripe sandbox dashboard if an operation is ambiguous. Retry the existing command rather than inventing a successful result. An unconfigured key, provider outage, unavailable payment method or invalid provider response produces an error and leaves customer commerce unchanged.

Do not use actual payment credentials or customer data in sandbox tests. No external provider request was made during fixture-based unit/component verification.

## API

Prefix: `/api/v1/organizations/{id}/storefront/payment-sandbox`.

| Method / suffix                            | Behavior                                                              |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `GET /` (prefix itself, no trailing slash) | Safe local status; `customer_checkout_enabled` is always false        |
| `POST /checkouts`                          | Empty JSON object and UUID `Idempotency-Key`; fixed test payment only |
| `GET /checkouts/{sessionId}`               | Authoritative scoped Session/refund status                            |
| `POST /checkouts/{sessionId}/refund`       | Empty JSON object; full scoped test refund only                       |

POSTs require the normal session, allowed Origin and CSRF token. All routes use `storefront.manage`. The adapter pins Stripe API `2024-06-20`, uses bounded HTTP/context timeouts, refuses redirects, bounds responses, does not retry automatically and never echoes raw provider/network errors or credentials. No SDK/dependency installation was required.

## Remaining approved work — not implemented by this sandbox slice

The subsequent [single-store source slice](single-store.md) adds explicit existing-organization deployment scoping and matching UI. It does not complete the stock/payment/delivery work below, and no primary runtime setting was changed.

1. Enforce/select the single shop without deleting existing tenants or weakening authorization; remove multi-organization UI from normal usage.
2. Configure separate front/back stock locations, real transfers and publication. Online availability must use backroom available stock.
3. Add transactionally safe reservations and expiry/reconciliation that every competing stock writer respects, including POS, transfers and quality actions where applicable.
4. Add customer delivery details, shipping charges, immutable order totals and durable payment attempts. Gateway amounts must come from those server-side snapshots, never a browser amount.
5. Add signature-verified durable webhook inbox/processing, deduplication, out-of-order handling and recovery. Do not acknowledge a business payment event before it is durably accepted.
6. Enable customer Checkout only after reservations/order/payment reconciliation are integrated. No customer-facing payment button is enabled by the diagnostic.
7. Implement preparation, shipment posting, online sales/channel reporting and cancellation/refunds/returns independent of POS shifts. Preserve exact money/quantity, batch/expiry rules, audit and atomic once-only stock posting.
8. Verify the full flow on a confirmed isolated database plus a real Stripe sandbox. Primary stack/data remain unchanged until explicitly approved.

## Verification in this continuation (2026-10-12)

- Passed: focused sandbox frontend tests 20/20; complete frontend suite 217/217 across 34 files; contract inventory (17 modules/114 routes); log-format tests 10/10; development-stack configuration tests 5/5; TypeScript typecheck and production build.
- Passed: `go test -count=1 ./...`, `go vet ./...`, `go build ./...` from `apps/api`, plus read-only `gofmt -l` on the affected Go files (no output). The focused Go package rerun also passed, with cached results; the complete rerun above did not use cached test results.
- Passed: focused Chromium browser tests 2/2 against a temporary loopback-only Vite server with every API request intercepted by synthetic fixtures. Covered disabled configuration, Checkout creation/CSRF/idempotency header, unpaid-to-paid status, pending refund, denied staff access, keyboard actions and overflow assertions at 390/768/1440 pixels. Screenshots were generated and visually inspected at all three widths. This does not prove live API authorization, database isolation or real Stripe payments.
- Non-blocking warnings: ESLint reports three existing Fast Refresh warnings in unchanged files; Vite reports the existing large JavaScript chunk warning. No unrelated warning cleanup was performed.
- The first scoped Prettier check failed on eight sandbox-related files. Corrected only those files through `apply_patch`; the scoped recheck passed. Frontend typecheck/lint/full tests/contracts/log-format/dev-stack/build and the two Chromium scenarios passed again after formatting. `git diff --check` passed. The task-created Vite process was verified and stopped; no existing service was stopped.
- Not run: real Stripe sandbox requests, primary or isolated database integration, migrations, customer commerce acceptance and race detection. The host reports `CGO_ENABLED=0`; no toolchain, containers or global configuration were changed to enable race checks. No payment secret was requested in chat or read from credential files.

## Official references

- Checkout creation: https://docs.stripe.com/api/checkout/sessions/create
- Checkout retrieval: https://docs.stripe.com/api/checkout/sessions/retrieve
- Refunds: https://docs.stripe.com/api/refunds/create
- PromptPay: https://docs.stripe.com/payments/promptpay
- Test payments: https://docs.stripe.com/testing
- API pin: https://docs.stripe.com/changelog/2024-06-20

These describe provider capabilities, not evidence that the complete SmartPOS online sales flow has been implemented or tested against Stripe.
