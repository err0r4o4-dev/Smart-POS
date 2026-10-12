# Separate online stock sources

Implemented and verified locally on 2026-10-12, continuing the selected online-flow chat. This is an additive source-configuration slice for the existing pickup/reservation/POS flow, not customer Checkout, webhooks, shipping, refunds or channel-report acceptance. No primary-stack migration or restart was performed.

Current cumulative status: the API code requires clean schema23, and downstream internal payment/reconciliation/delivery-snapshot/pre-shipment-refund slices exist. The complete online flow is **PARTIAL / PAUSED by the user**. The schema16 verification below is historical source-slice evidence, not a complete commerce acceptance run; see [current status and policy](payment-sandbox.md#current-online-flow-status-2026-10-12).

## Configuration and compatibility

- `storefronts.terminal_id` remains the existing primary/front terminal. Without `online_terminal_id`, online catalog, quotes, reservations and pickup settlement continue to use that terminal's source.
- Optional `online_terminal_id` selects a second active terminal at a distinct active `WAREHOUSE` in the same branch. It is not a raw location override: existing POS settlement must use a terminal whose source matches the reserved order.
- The settings form uses existing active branch terminals. Configure the online terminal's warehouse in POS settings first. The server validates the warehouse type and branch regardless of the browser's options.
- Both terminals remain ordinary POS terminals. This does not prohibit staff from selling unreserved warehouse stock through a separately authorized POS operation, introduce channel-specific permissions, or relocate physical stock. Existing reservations continue to protect held quantities from competing writers.
- Front and back quantities are never summed. A backroom shortage or inactive online terminal closes/rejects the online quote; it does not fall back to the front source.
- Existing clients/configurations that omit the new optional field keep shared-source behavior. PUT is full replacement: sending an empty string or omitting the field clears the optional source when there are no live orders. Clients editing a configured separate source must round-trip the field.

## Transactions and historical identity

Go retains tenant/branch permission checks and the organization-row lock. Source selection, quote validation and order snapshots remain server-owned. New orders freeze the effective online terminal, branch and physical stock location in the existing immutable order columns. Changing settings never rewrites historical order sources.

Any live order prevents changing either configured terminal, including a linked POS cart after the original expiry. A source/settings revision change invalidates previous quotes. The database independently rejects live source changes and incompatible same-location, cross-branch or foreign-tenant source assignments. While separate sourcing is configured, neither terminal can be moved to another source; detach the separate configuration first, subject to the live-order guard. Terminal deactivation is allowed, but quotes no longer accept that inactive source.

Reservations, quality checks, recalls, stock posting, audit events, receipts and exact decimal handling remain owned by their existing modules. Staff preparation uses the snapshotted source. Staff must select/open their shift at the order's online terminal to settle the pickup through POS. The existing order-to-POS handoff already offers the correct terminal. Payment/stock/order completion remains atomic and retry-safe; this slice does not add a second deduction path.

Inventory responses retain the existing warehouse classification: physical `quantity` and live `reserved` are reported, while that legacy inventory page's POS-oriented `available` remains zero for warehouses. Storefront and order-linked POS availability use the safe free quantity at the selected source; their assertions are separate from that inventory display contract.

## API and data impact

- Existing `GET`/`PUT /api/v1/organizations/{id}/storefront` gain optional `online_terminal_id`; no route is added.
- Management `stock_location_id` is the effective online source. Management `terminal_id` remains the configured front terminal; a new order's `terminal_id` is the snapshotted effective order terminal.
- Public settings omit both terminal IDs, branch and location. Customer order/tracking projections retain their existing redaction and token ownership.
- Additive migration `000016_online_stock_sources.up.sql` adds one nullable composite tenant FK and source guards to existing FORCE-RLS tables. Existing rows remain shared-source; no order backfill, stock movement or balance rewrite is performed.
- This source checkpoint introduced schema16; current API code requires clean schema23. Source/UI changes and migration must be rolled out together through an approved up-only process. No primary migration/restart is part of this task. The migration deliberately has no down/reset path; retained schema15-data upgrade acceptance is a separate rollout check.

## Current verification

- `npm run verify:single-store` passed on fresh task-owned tmpfs PostgreSQL with official migrations through schema16 and runtime-role transactions. Existing scope/reservation checks passed alongside 11 new source subcases: live-order lock, inactive-source closure, public redaction, invalid/unauthorized sources, database source guards, stale quote/history, source-specific reservation/retry, no fallback, cancellation, exact-once warehouse POS settlement and switching back without historical mutation. Only script-owned database/network resources were cleaned up.
- `go test ./...`, `go vet ./...`, `go build ./...` passed. New HTTP JSON tests cover omitted/shared/separate source and invalid type/unknown field. Changed Go files were checked with gofmt. Integration tests are skipped by ordinary Go test without the explicit isolated DSN; the separate database acceptance command above supplies it.
- `npm run test` passed: 36 frontend files / 232 tests, contracts, logs 10/10 and dev-stack 5/5. `npm run typecheck`, `npm run lint`, `npm run build` passed. Three existing React Refresh lint warnings and the existing large-chunk build warning remain.
- Headless Chromium on Windows passed 8/8 API-fixture browser checks across single-store, payment sandbox and reservation scenarios. The new settings scenario saves distinct front/back IDs, exercises focus, preserves the primary terminal and checks horizontal overflow at 390/768/1440 widths. Screenshots at all three widths were visually inspected: labels/help text wrap, controls remain usable and no affected content is clipped. Viewport emulation is not real-device or Safari/Firefox evidence. These fixture checks do not call Stripe or prove backend/database behavior.
- Scoped Prettier, affected document-reference checks and `git diff --check` passed after correcting the new browser fixture's formatting. Only the verified task-owned Vite process on port5192 was stopped after browser verification. A concurrent change to `apps/web/src/features/pos/POSWorkspace.tsx` was preserved and is not attributed to this task. No production deployment occurred.
- RED evidence: before implementation, the focused component test could not find an online-source selector, and fresh schema15 database acceptance still returned the front source after a requested back-terminal assignment. Expanded tests initially had test-variable compile typos; fixed without reducing coverage. A warehouse inventory-display expectation was corrected to its existing POS-oriented zero-available contract, with a separate storefront free-availability assertion retained. The first browser screenshots captured the post-submit scroll/focus state; normal pointer focus and scroll-to-top actions were added before final screenshots, without changing application styles.
- Not run: primary migration/restart, retained schema15-data upgrade, real Stripe, complete customer commerce flow, real devices/other browser engines and race detection (`CGO_ENABLED=0`). No dependencies, compilers, models/providers, global configuration or credentials were changed.

## Remaining online flow

Internal Checkout/webhook evidence, delivery snapshots and durable pre-shipment cancellation refunds are implemented downstream. Still paused in root `TODO.md`: atomic packing/shipment and goods-return posting, explicit lot allocation UI, merchandise-only post-shipment refunds, remaining operational recovery, matching public/staff HTTP/contracts/runtime/UI, channel reports and complete isolated/browser/real-provider acceptance. No live Stripe request or production claim is made by this source slice.
