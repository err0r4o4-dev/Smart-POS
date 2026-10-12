# Online reservation foundation

Continuation: [separate online stock sources](online-stock-sources.md) adds optional same-branch warehouse sourcing in schema16. The schema15 scope/results below remain historical; customer payment/delivery acceptance is still separate.

Status: implemented and verified locally on 2026-10-12 with official schema15 in a new isolated PostgreSQL. Not deployed or migrated on the primary stack; not customer payment/delivery acceptance.

## Scope and ownership

This slice adds atomic quantity holds to the existing guest pickup flow. It deliberately preserves the storefront terminal and its stock source. It does **not** select a warehouse automatically, split front/back channels, allocate lots, receive customer payments, or implement shipping/refunds/channel reports.

- Migration `000015_online_reservations.up.sql` adds immutable `online_orders.stock_reserved`. Existing rows remain false; new inserts default true. There is no API to toggle it or retroactively claim unavailable stock for legacy orders.
- Frozen `online_order_items` are the durable quantity evidence. No second mutable reservation quantity or physical stock movement is created just to hold/release stock.
- Reservation identity is organization + snapshotted stock location + Variant. Branch authorization, composite FKs, FORCE RLS, exact `NUMERIC(18,3)` quantities and the existing organization-row serialization remain authoritative.
- `storefront_reserved_quantity` and `storefront_sellable_quantity` are tenant-scoped invoker functions with revoked PUBLIC execution and explicit runtime grants. Narrow trigger guards use fixed search paths and validate tenant context.

## Lifecycle and invariants

1. Browser carts and quotes do not hold stock. Successful order creation holds all items in the same transaction as snapshots/events. Capacity is rechecked under the organization lock; a deferred database constraint also rejects overcommit when application quote validation is bypassed.
2. Live holds belong to new `PENDING`, `PREPARING` or `READY` orders whose deadline has not passed, or whose POS cart is still linked. Legacy orders are not counted. Idempotent retries return the same order without another hold; changed payloads conflict.
3. Rejection/cancellation immediately removes the order from the live-hold sum without changing on-hand. Unlinked orders stop holding at their existing 48-hour deadline, using database statement time; no worker or cleanup write is required. Retrying an expired order does not reacquire stock.
4. A linked POS cart stays held past the deadline, including held carts or payment reconciliation. Cancelling the cart unlinks it; the original deadline then applies. Existing payment-resolution gates remain in place.
5. `inventory_reservation` runs after the existing aggregate and quality posting triggers for **every** ledger INSERT. Negative movements cannot reduce saleable stock below other live holds. The existing transaction rolls back all balance/quality updates on rejection. The only consuming exception is a matching online-order POS sale at the snapshotted source with the exact reserved Variant quantity; existing deferred sale/order constraints must still reconcile the complete sale.
6. Matching POS carts see their own reserved quantity when reviewing/settling, but never another order's hold. Sale posting, payment evidence, receipt and order completion remain one transaction. Replaying settlement cannot deduct stock twice.
7. Holds protect saleable quantity, not a specific lot. Recalls, quarantine and expiry still override fulfillment safety. Unsafe stock disposal is not blocked merely because an outstanding hold has become unfulfillable; staff must reject/cancel the affected order. POS still requires actual batch/quality verification.

Public storefront and POS product `available` exclude live holds. Quality-specific cart availability is bounded by both the selected batch balance and the free safe pool. Inventory balance responses keep physical `quantity`, report live `reserved`, and compute quality-aware free `available` under existing location eligibility. The stock page's historical warehouse label/eligibility is not redefined by this slice.

Customer/catalog/cart/consent and staff settings copy now describe reservation after successful submission. Tracking keeps a neutral readiness/deadline notice that also remains accurate for legacy unreserved orders. No public response fields or routes were added; existing decimal-string fields keep their types. Inventory/Storefront availability semantics are documented in OpenAPI.

## Rollout and compatibility

The API now requires schema **15**, not 14. Deploy matching API/web assets and authorize migration rollout separately; do not run `stack:up` as verification. Applied migrations 1–14 are unchanged. Primary settings, UUID configuration, services and data were not modified during this task.

Existing orders remain unreserved rather than competing retroactively for insufficient stock. They still pass normal POS stock/quality checks and cannot consume newer orders' holds. A replay of a legacy order does not upgrade it. Historical snapshots, movements and payments are not rewritten. Upgrade against a retained schema14 dataset has **not** been exercised; fresh official migrations were exercised on disposable test databases.

This reservation source must not be repointed to a warehouse while retaining the old POS-import settlement path. Front/back source configuration belongs to the next delivery/channel slice, with its own source snapshots and fulfillment posting invariants. Customer Stripe Checkout must wait for durable payment attempts/webhooks/reconciliation and delivery totals; the management sandbox is still separate.

## Verification evidence

- RED: order creation still exposed all 3 units instead of 1 free unit and allowed a competing 2-unit order. Separate inventory RED reported reserved=0/available=3 instead of 2/1. Customer notice/consent and later tracking/settings copy assertions failed before their changes.
- GREEN: `npm run verify:single-store` passed the existing seven scope/HTTP acceptance subcases plus 12 reservation subcases on fresh official schema15 using `smartpos_runtime`: exact/changed retries, competing/concurrent orders, ledger rollback, direct deferred overcommit, tenant/source isolation, inventory projection, cancellation, expiry, linked POS settlement/replay, linked expiry reconciliation and recall disposal.
- One expanded test initially requested nonexistent `inventory.balance.read`; corrected to existing `inventory.read` without changing grants. Early RED competing-order success also left a live fixture that correctly blocked unpublishing; this secondary failure disappeared once overcommit was rejected. A new tracking assertion initially ran during its loading state; it now waits for the actual tracking response.
- `npm test`: 229 frontend tests/36 files, contract inventory, logs 10/10 and dev-stack 5/5 passed. `npm run typecheck`, `npm run lint` and `npm run build` passed; three existing Fast Refresh warnings and the existing large-chunk warning remain.
- Go `go test -count=1 ./...`, `go vet ./...`, `go build ./...` passed. The dedicated integration command, not the ordinary Go suite's skipped integration test, supplies database evidence.
- Chromium API-fixture browser tests passed 7/7: reservation consent/submission plus single-store and sandbox regressions. Cart/consent screenshots at 390/768/1440 were captured with no horizontal overflow; 390/1440 images were visually inspected. These browser fixtures are not real database or Stripe acceptance. Artifacts: `.local/reservations-browser/results`.
- Formatting initially failed on a Go test and two frontend/browser files; scoped apply_patch fixes resolved it. A whole-file formatting patch hit the Windows argument-length limit, and the gofmt diff command returned nonzero for differences; small scoped patches were used instead.
- Not run: real Stripe calls, full customer delivery flow, retained-data upgrade acceptance, CGO race tests (`CGO_ENABLED=0`), real-device or non-Chromium compatibility. No dependencies were installed.

The existing isolated verifier checks loopback port15514 is free, uses cached images, provisions a task-owned PostgreSQL tmpfs/network, applies official migrations only there, checks the marker/empty initial fixtures, then removes only owned disposable resources. The temporary fixture Vite process was stopped; no primary database/volume or unrelated service was used for acceptance.
