# SmartPOS — Phase 1 / Phase 2 / Phase 3 / Phase 4 / Phase 5 checklist

## Task — customer test Checkout and durable webhook reconciliation (2026-10-12)

- [x] Inspect Stripe adapter, configuration, reservation expiry, POS confirmation, immutable sale guards and customer return-token boundary; preserve clean starting diff.
- [x] Define acceptance: explicitly gated development-only Checkout from frozen order totals, signed raw-body webhooks, durable replay-safe evidence, protected stock holds, no duplicate POS payment and no secret/token in provider URLs.
- [ ] Add and run focused failing tests before each payment behavior slice.
  - [ ] Complete approved delivery flow: store-owned flat shipping fee, frozen address/charge, customer Checkout/webhooks/tracking, staff carrier/tracking shipment, pre-shipment full refund including shipping, post-shipment goods-return workflow and channel reports; preserve pickup and primary data.
    - [x] Inspect actual quote/order/payment/reconciliation/POS/inventory contracts and existing user diff; user approves flat fee, manual carrier/tracking and refund-before-shipment versus return-after-shipment boundary. No production rollout or primary migration is authorized.
      - User confirms post-shipment goods returns refund merchandise only, excluding the original shipping fee. Pre-shipment cancellation refunds the full frozen charge including shipping.
    - [ ] Test and implement delivery snapshots, durable refund evidence, atomic shipment/return stock posting and financial/source/tenant/idempotency guards.
      - [x] Schema22 delivery snapshots: enabled/flat-fee settings, pickup defaults, quoted merchandise plus shipping, frozen order address/fee and public address redaction; isolated RED/GREEN passed.
      - [x] Schema23 internal pre-shipment refund slice: committed full-charge intent before network, exact keyed request identity, bounded same-key retry, known/discovered Refund GET verification, append-only observations, terminal replay, staff reauthorization and atomic successful cancellation/hold release. Pending/failed/mismatched evidence retains holds; refund intent blocks prepaid settlement. Five delivery acceptance groups and two focused Stripe refund tests passed with synthetic provider evidence.
      - RED evidence: adapter/service stubs rejected dispatch/refund; completed refund initially appeared as unresolved review; a future refund timestamp initially extended retry eligibility. Each relevant regression reached GREEN after its implementation/guard change. The first Go invocation from repository root failed because the Go module lives in apps/api; corrected without creating a module.
      - [ ] Implement atomic shipment and goods-return posting, merchandise-only post-shipment refunds (including existing partial-return requirements), and channel financial reporting; schema23 currently permits only pre-shipment cancellation, not post-shipment refunds.
    - [ ] Connect matching Go routes/runtime options, OpenAPI/inventory, React customer/staff/settings/report controls and focused interaction tests.
    - [ ] Verify fresh isolated flow, unit/regression/contracts/frontend/build/browser checks and retained-data upgrade; report real-provider prerequisites honestly, never claim missing provider or production evidence.
      - [x] Refund slice verification: fresh schema1–23 owned-tmpfs acceptance/cleanup; fresh Go tests, vet/build; contracts (17 modules/114 routes), typecheck, lint (0 errors/3 warnings), frontend37 files/245 tests and web build passed. Scoped formatting/diff checks recorded in docs/development/verification.md. No real Stripe, browser, retained-data upgrade, primary migration or race-detector acceptance; full-flow gate remains unchecked.
    - [ ] Final scoped review/documentation and task cleanup only after all required acceptance succeeds; retain unfinished gates and existing roadmap.
  - [ ] Operational reconciliation slice: staff verify a discovered Session via authenticated GET; never trust a staff-supplied paid/expired result, search/guess provider Sessions, create another Checkout, manually release stock or execute refunds.
    - [x] Inspect tracking recovery, canonical observations, dispatch identity, organization/branch permissions, monotonic payment/hold guards and existing fake-gateway/owned-tmpfs seams. Use existing storefront.manage plus online_orders.manage and recheck authority after network; keep public routes/UI disabled.
    - [x] Add/run RED-to-GREEN unknown-Session verification, durable replay/audit/tenant/rollback tests and paid-unfulfillable review tests: eight grouped schema21 runtime-role cases passed, including credential drift/offline replay, disabled expiry/late paid and authority revocation during GET.
      - RED: discovered-Session recovery and fulfillment-review stubs returned conflict. Initial implementation did not compile with a nonexistent has helper; corrected to slices.Contains. Existing SQL refused terminal retrieval against an unbound attempt; validated/nonterminal binding now occurs before the retrieval journal inside one transaction, without weakening historical guards. All verifier runs cleaned only owned tmpfs/network.
    - [x] Implement internal staff reconciliation and append-only schema21 review records; reuse canonical observations and exact frozen identity, recheck authority after network, retain payment/stock/sale invariants. Paid-unfulfillable report blocks prepaid settlement in Go/SQL; no automatic refund, manual hold release or public routes.
    - [x] Verify isolated schema21/eight staff groups and existing suites, focused/full Go tests, vet/build, contracts (17 modules/114 routes), scoped gofmt/Markdown formatting, git diff --check and final scoped review. Owned tmpfs/network cleanup passed; document remaining refund, unfound-Session resolution, batch/customer/retained-data rollout gates and keep the parent checklist. No real provider, primary migration, browser or race-detector run; CGO_ENABLED=0.
  - [x] Orchestration inspection/design: persist a keyed request fingerprint before external create; replay only unchanged requests within the supported expiry window, use known-session GET for recovery, and journal retrieval evidence separately from webhook event IDs. Keep network calls outside transactions and all customer routes disabled.
  - [x] Orchestration RED/GREEN: unknown create/retry, committed dispatch/no open transaction, configuration drift, create-only nonterminal evidence, retrieval PAID/EXPIRED, stale observations, replay/RLS/append-only and disabled-feature recovery; 20 groups plus one nested webhook-only recovery case passed on fresh schema19.
    - RED: keyed fingerprint unit test failed with missing fingerprint; schema18 orchestration acceptance failed because the stub never dispatched and could not retry. Existing persistence/hold/reservation/source/catalog groups passed; owned tmpfs/network cleanup completed.
    - Expanded wire RED exposed a missing Idempotency-Key in the request fingerprint. Shared the unchanged key builder between fingerprint and dispatch; no provider/API pin was changed. One patch initially used the API directory with root-relative paths and failed without writing files. Scoped gofmt reported alignment differences; corrected only the new observation struct.
  - [x] Adapter/config RED-to-GREEN: missing webhook configuration, malformed enable flag, provider URL fragments, invalid slug/expiry, untrusted session leakage, duplicate empty signature timestamp, unrelated event parsing and oversized trailing provider payload.
  - [x] Durable attempt/inbox/state tests: schema/state/precision RED-to-GREEN, plus 15 grouped runtime-role acceptance scenarios covering signed replay/concurrency/order/mismatch/rollback/immutability/scope and no fulfillment side effects.
  - [ ] Prepaid POS slice: test server-owned PAID evidence, READY/unreleased fulfillment, exact frozen lines/total, atomic sale/stock/receipt, replay, no cash effects and legacy/manual-payment denial. Keep customer routes/UI off; price/quality/shift failures retain the paid hold without partial settlement.
    - [x] Inspect existing POS settlement, pricing revalidation, inventory posting, immutable history and schema18 payment gate. Use the existing settlement transaction; reject price/discount drift rather than silently repricing the paid order. Batch-managed items without an authorized batch selection remain fail-closed in this internal slice.
    - [x] Add and run focused prepaid RED/GREEN acceptance on the owned isolated verifier: 11 groups include concurrent once-only sale/stock/receipt, no cash effect, tenant/member/revision checks, price rollback, bare/manual/fake-completed checkout guards, immutable evidence, late paid/released hold and recall/readiness.
      - RED: valid settlement failed against the stub; expanded pending test exposed a NULL PaymentIntent scan, corrected to conflict. Quality rejection was initially misclassified as price drift; corrected without weakening safety. SQL fake-completed checkout test exposed missing sale linkage; deferred guard now requires actual completed order/sale. Initial helper compile typo and a failed correction patch were not behavioral RED evidence; all isolated runs cleaned only owned tmpfs/network.
    - [x] Implement additive schema20 and internal-only prepaid orchestration; existing POS settle/stock ledger commits all fulfillment records atomically, failures retain the paid hold, price/batch/quality drift fail closed. Focused/full Go tests, vet/build and fresh isolated regressions passed; document remaining batch/reconciliation/customer/retained-data rollout gates.
  - [x] Hold slice inspection: expiry predicates span stock quantity/deferred checks, storefront reads/settings/source guards and POS import/terminal settings. Use one tenant-scoped liveness predicate; retain unresolved/paid holds, irreversible confirmed-expiry release and block legacy POS for any payment attempt.
  - [x] Hold slice RED/GREEN: cancellation, deadline liveness, both expiry/paid arrival orders, no resurrection after cancellation, legacy POS denial, stock and tenant regression; 16 grouped cases passed on fresh schema18.
    - Behavioral RED on fresh schema17: both direct/staff cancellation incorrectly succeeded, shared deadline liveness was absent. Fixed a new fixture UUID collision with the existing source suite; prior persistence/reservation/catalog groups passed. All owned resources were cleaned up.
    - First schema18 run passed all 10 hold groups but overall acceptance failed because the new organization creation key also collided with the existing source fixture; changed only the new key. No existing test or grant was weakened.
  - Persistence checkpoint: internal-only attempts/inbox with exact frozen THB charge, immutable session binding, signed event deduplication, atomic evidence/state commits and monotonic PAID. The subsequent hold slice is integrated below; customer routes/recovery/prepaid POS remain gated. Verify only on the script-owned tmpfs database; no primary migration.
    - RED: isolated schema16 acceptance failed only because online_payment_attempts/online_payment_inbox were absent; previous scope/reservation/source/catalog cases passed and owned tmpfs/network cleanup completed.
    - State RED: missing monotonic transitions failed as expected before implementation. Expanded database run found the new query used stock_held instead of the actual stock_reserved column; corrected service/new migration to the existing schema, without changing migration15 or weakening checks.
    - Precision RED: direct attempt insertion accepted fractional expiry even though the provider session uses whole Unix seconds. Added an exact-second constraint to the new migration; no historical migration was changed.
- [ ] Implement payment persistence/gateway/webhooks and prepaid pickup settlement with tenant/idempotency/quality guards; no primary migration or real Stripe calls.
  - [x] Implement internal create/retry and retrieval orchestration with durable dispatch and observations; retain unresolved outcomes without inventing events, releasing holds or changing charge identity. Known-session retrieval supports default-off recovery; unknown Sessions past the safe replay window remain held for future operational reconciliation.
  - [x] Development-only, default-off CustomerPayments configuration; separate card-only customer adapter with frozen charge/session validation, scoped provider idempotency and raw HMAC webhook verification. No public/customer/webhook route is registered; the diagnostic still reports customer_checkout_enabled=false.
  - [x] Internal frozen attempts and append-only signed inbox with atomic first binding/state commits, canonical replay identity and monotonic PAID; schema17 readiness. No provider calls or public customer/webhook routes are enabled.
  - [ ] Complete operational resolution/refunds before enabling any customer route; server-evidence-only POS settlement and verified discovered-Session recovery/review are integrated. An unfound Session cannot be marked absent or its stock released by staff assertion.
  - [x] Implement forward-only payment hold lifecycle and shared liveness; unresolved attempts cannot auto-release or cancel. Confirmed-expiry release is irreversible, late paid cannot restore released stock, and legacy POS blocks all payment-backed orders. External calls, refund handling and prepaid settlement remain gated.
- [ ] Connect customer tracking/POS UI and matching contracts/configuration/documentation.
  - [x] Document the unrouted adapter boundary and remaining lifecycle in docs/architecture/payment-sandbox.md. No customer capability, public contract, Compose forwarding or tracking/POS UI is enabled by this slice.
- [ ] Verify fresh isolated database and focused/regression/browser checks; retain failed/blocking evidence.
  - [x] Orchestration verification: fake-gateway schema19 acceptance (20 groups plus one nested case), focused/full Go tests/vet/build, contracts (17 modules/114 routes), scoped Go/Markdown formatting, git diff --check and final scoped review passed. Owned tmpfs/network cleanup passed. No real Stripe/primary migration/customer routes or prepaid settlement.
    - Preserve the parent checklist: prepaid settlement, operational unknown-Session reconciliation, customer HTTP/UI and retained-data rollout gates remain incomplete. Concurrent storefront header/catalog changes and their separate TODO section were preserved; no commit, deployment or production data change.
  - [x] Focused Stripe/config packages and full go test -count=1 ./..., go vet ./..., go build ./... passed. Contract inventory (17 modules/114 routes), scoped gofmt/Prettier and git diff --check passed. No database target was configured for ordinary Go regression.
  - [x] Current persistence slice: fresh official schema17 acceptance passed 15 payment groups plus existing scope/reservation/source/catalog groups; owned tmpfs/network cleanup passed. Full go test -count=1 ./..., go vet ./..., go build ./..., contracts (17 modules/114 routes), scoped gofmt/Prettier and git diff --check passed. Changed paths and remaining gates are recorded in docs/architecture/payment-sandbox.md.
  - [x] Prepaid internal acceptance: fresh official schema20 runtime-role verification passed 11 groups plus existing persistence/hold/orchestration/reservation/source/catalog suites. Focused/full Go tests, vet/build, contracts (17 modules/114 routes), scoped Go/Markdown formatting, git diff --check and owned cleanup passed. No new public route/tender input, frontend change, real provider call or primary migration. Keep this parent task section because customer/batch/reconciliation/rollout work remains incomplete.
  - [ ] Customer HTTP/browser/real Stripe, explicit batch selection, operational unknown-Session and paid-unfulfillable reconciliation remain not run/unimplemented. Primary rollout and retained-data upgrade were not performed. Race checks were not run because CGO_ENABLED=0; no toolchain/configuration was changed.
  - [x] Hold slice verification: final fresh owned tmpfs schema18 acceptance (16 hold groups plus persistence/scope/reservation/source/catalog regression), focused/full Go checks, vet/build, contract inventory (17 modules/114 routes), scoped gofmt/Prettier and git diff --check passed. No primary migration or real provider calls.
    - Initial test compile failed on a helper typo (undefined t); corrected before behavioral RED. The first correction patch did not match and made no changes. Owned tmpfs/network cleanup passed; these are not behavioral RED evidence.
    - Final scoped diff reviewed; concurrent catalog/frontend/contracts work preserved. Future-deadline checks use the production SQL predicate's observation-time seam, not a changed database clock. Retained-data upgrade, real provider/browser, prepaid settlement and CGO race checks remain separate gates; keep this parent task section until those required slices are complete.
- [ ] Review and remove only this temporary task section when acceptance passes; retain the original shipping/refund/report/full-flow task.

## Task — single-store online flow and Stripe sandbox (2026-10-12)

- [x] Inspect storefront/POS boundaries, configuration and test seams; choose Stripe sandbox with user authorization.
- [x] Test the first slice: management-only sandbox Checkout, authoritative status and test refunds; never mutate orders, sales or stock.
- [x] Implement adapter, test-only configuration, protected API, management UI and matching contracts.
- [x] Run focused/regression checks and document actual results and setup without secrets.
  - Current continuation: focused frontend 20/20, full frontend 217/217, contract inventory, logs 10/10, dev-stack 5/5, Go tests/vet/build/gofmt and fixture-based Chromium 2/2 passed. Screenshots at 390/768/1440 generated and visually inspected.
  - First scoped Prettier check failed on eight sandbox-related files; corrected through apply_patch and final scoped recheck passed. Post-format frontend gates and Chromium rerun passed; only the task-created Vite process was stopped. Details: `docs/architecture/payment-sandbox.md`. Real Stripe, database integration and CGO race checks have not run.
- [ ] Complete remaining approved flow: single-store enforcement, front/back stock, atomic reservations, customer checkout, durable webhooks, shipment posting, cancellation/refunds/reports.
  - [x] Separate online source configuration for the existing pickup/POS flow: optional same-branch warehouse terminal, no front fallback, historical snapshots and exact-once reserved settlement. Fresh schema16 runtime-role acceptance includes 11 source subcases; frontend 232/232 and Chromium fixtures 8/8 pass. See `docs/architecture/online-stock-sources.md`. Primary migration/restart, retained-data upgrade and customer payment/delivery acceptance were not performed. Existing earlier checkpoints below retain their historical scope and counts.
  - [x] Inspect single-store scope, public discovery/tracking, organization creation/invitations and existing UI seams.
  - [x] Define and test explicit server-side single-store configuration; reject other stores without changing membership permissions or data.
  - [x] Implement scoped organization/public storefront access and hide organization creation/switching in single-store UI.
  - [x] Verify focused and regression checks, fixture browser behavior, contracts and setup documentation; retain downstream stock/payment/fulfillment items until implemented.
    - RED evidence: foreign scope reached the database, creation returned INVALID_INPUT instead of denial, malformed configured UUID was accepted after correcting SMTP prerequisites, and UI still offered organization creation/public selection. Relevant tests pass after implementation.
    - Typecheck initially failed on asynchronous callback narrowing; corrected without weakening checks. First isolated internal-network marker prerequisite failed; fresh dedicated-bridge reruns passed, latest seven real HTTP/runtime-role database subcases on official schema14 via `npm run verify:single-store`. Browser fixtures 6/6, full frontend 228/228, typecheck/lint/build/contracts/logs/dev-stack, Go tests/vet/build/gofmt and scoped formatting/diff checks passed. Only task-owned test services were cleaned up. Details: `docs/architecture/single-store.md`.
    - Single-store source is verified, but no primary setting/restart was applied: activating requires the intended existing `SINGLE_STORE_ORGANIZATION_ID`. Front/back stock, atomic reservations, customer Checkout, durable webhooks, shipment posting, cancellation/refunds/reports and real Stripe/full-flow acceptance remain unchecked in the parent item.
- [ ] Verify complete flow on an explicitly isolated database and Stripe sandbox. Real Stripe checks require a locally configured test key; do not implicitly migrate/rebuild the primary stack.
  - [x] Inspect stock writers, organization locking, quality availability and linked POS cart invariants.
  - [x] Define/test reservation foundation: atomic creation/retry, competing orders/writers, cancellation/expiry, tenant scope and linked POS settlement.
    - RED on fresh isolated PostgreSQL: committed orders still exposed 3 instead of 1 free unit and a competing order succeeded. A separate inventory projection RED showed reserved=0 instead of 2. Frontend notice/required-consent assertions also failed before the copy change; focused GREEN now passes.
    - Expanded fixture initially used nonexistent `inventory.balance.read`; corrected to the existing `inventory.read` without changing authorization. The resulting 12 reservation subcases pass on official schema15, including concurrency, deferred capacity, runtime RLS/source, recall disposal and linked POS settlement/replay.
  - [x] Implement additive reservation schema, central ledger protection and reservation-aware storefront/POS/inventory availability without changing the existing pickup source.
  - [x] Run fresh isolated database acceptance and focused/regression checks; document migration compatibility and remaining front/back delivery work.
    - Current reservation checkpoint: fresh official schema15 runtime-role/HTTP acceptance passed (seven existing scope cases plus 12 reservation subcases). Full frontend 229/229, contracts, logs 10/10, dev-stack 5/5, typecheck/lint/build, Go tests/vet/build and Chromium API fixtures 7/7 passed. Cart/consent captured at 390/768/1440; 390/1440 visually inspected. Existing lint/chunk warnings remain.
    - Initial formatting checks failed; small apply_patch formatting changes resolved them after a Windows whole-file argument-length failure and a nonzero gofmt diff result. A tracking assertion also needed to await the actual response rather than its loading heading. No checks were weakened. Details and compatibility: `docs/architecture/online-reservations.md`.
    - Only task-owned tmpfs PostgreSQL/network and temporary Vite processes were cleaned up. Primary migration/restart, real Stripe, retained schema14-data upgrade and CGO race checks were not run. The API now requires schema15; legacy orders are deliberately not backfilled with holds.
    - Reservation foundation is complete for the existing pickup source, not the full flow. Front/back channel source configuration, lot allocation/delivery totals, customer Checkout, durable payment/webhook reconciliation, shipping, online cancellation/refunds/reports and end-to-end Stripe acceptance remain required. Keep this task section until those items and full-flow acceptance succeed.
- [ ] Remove only this section after all acceptance succeeds; retain it while required work remains.

Status: **Phase0–4 and Phase5.1–5.7 COMPLETED (Local); Phase5 overall COMPLETED (Local); Phase6–7 NOT STARTED; Phase6 NOT READY; Production Ready NO.** (2026-10-11), local acceptance only. Latest evidence: `docs/development/phase57-verification.md`. Earlier checklists/counts remain historical, not current run totals.

## Phase 5 completed locally (2026-10-11)

- [x] Inspect the existing transaction boundaries and preserve Phase 0–4 evidence.
- [x] Implement Phase 5.1 historical returns, Inventory posting and explicit refund settlement.
- [x] Add typed contracts, tenant-scoped Returns UI and a real gateway browser workflow.
- [x] Finish scoped Phase 5.1 acceptance: historical rounding, concurrent over-return, all-item rollback, late-shift cash, reconciliation, runtime RLS and same-key recovery.
- [x] Reproduce and fix managed-shelf over-capacity returns; 42 real assertions cover concurrent posting, inactive/unassigned shelves and recovery.
- [x] Rebuild isolated web/api; verify final print CSS, seven responsive widths and 19/19 real-enabled browser tests.
- [x] Fresh migrate 1–8/rerun and six rollback-only SQL suites; preserve primary volume, test data and retained scratch databases.
- [x] Record actual commands, failed attempts, limitations and remaining implementation work without replacing Phase 0–4 evidence.
- [x] Implement Phase 5.2 Exchanges/Voids through the existing Returns/POS/Inventory/RBAC engine.
- [x] Historical credit, equal/positive/negative/multi-item exchanges, approved revisions and immutable document linkage.
- [x] Explicit manual difference acknowledgement, once-only cash accounting, durable reconciliation/recovery and atomic Inventory posting.
- [x] Full-sale compensating reversals, prior-return conflict policy and existing uncommitted checkout cancellation.
- [x] Phase5.2 runtime RLS/RBAC/CSRF, concurrent exchanges/returns/POS/shifts and managed-shelf regression.
- [x] Fresh schema9/rerun, CGO race, 94 frontend tests and 21 real-gateway browser tests; preserve failed attempt logs and primary data.
- [x] Update Phase5.2 architecture/schema/security/business flows and evidence-based local acceptance report.
- [x] Implement Phase 5.3 price lists, four promotion types/policies, manual approvals and authoritative POS pricing.
- [x] Add migration10, FORCE RLS/runtime grants, exact immutable allocations, atomic usage and NONE settlement.
- [x] Implement five real Pricing routes and browser lifecycle/checkout/responsive coverage.
- [x] Finish Phase5.3 local acceptance:319 new/1699 total numbered API assertions,96 frontend tests,23 browser tests, schema10/seven SQL suites, Go race and8 reconciliation checks; record actual failures/limits.
- [x] Implement Phase 5.4 Customer CRUD/archive, groups, POS selection and authoritative history with privacy/RBAC/RLS.
- [x] Finish Phase5.4 local acceptance:253 Customer/1952 total numbered API assertions across18 suites,103 frontend tests,25 full browser tests plus final focused2/2, schema11/eight SQL suites, Go race and11 reconciliation checks; record failures/limits.
- [x] Implement Phase 5.5 Loyalty programs/accounts/immutable ledger, exact reward discounts, reservations and historical Returns/Exchanges/Voids compensation through existing engines.
- [x] Finish Phase5.5 local acceptance:249 Loyalty assertions,18 old API suites,144 frontend tests,37 gateway browser tests, fresh schema12/nine SQL suites, Go race and17 reconciliation checks; preserve failed attempts and production limits.
- [x] Implement and accept Phase5.6 Batch/Expiry/Write-offs/Recalls across existing Inventory paths:285 Quality assertions, schema13, real browser and24 reconciliation checks.
- [x] Complete Phase5.7 integration/security/QA:23 API suites/2620 numbered assertions,120 frontend tests,37 browser tests, fresh1–13/10 SQL suites, Go race, resilience and32 zero-mismatch checks. Limits and failed-run evidence retained; Production Ready NO.

## Phase 4 continuation and final acceptance

- [x] Inspect and retain existing purchasing/shelves implementation, migration 7, API contracts, typed frontend and test changes.
- [x] Focused purchasing frontend tests: 11 passed; full frontend regression: 75 passed; contracts/typecheck/lint/build and Go vet/tests/build passed on 2026-10-10.
- [x] Changed Go files pass format inspection; purchasing frontend/contracts/test files pass Prettier checks. No application-code fix was required by these checks.
- [x] Update current status and verification documentation without replacing earlier evidence or claiming a completed runtime gate.
- [x] Previous CGO blocker resolved for acceptance: Go format/vet/race/build passed in the existing api-check container, without changing host CGO configuration.
- [x] Previous Docker blocker resolved: isolated stack healthy; fresh migration runner 000001–000007, scratch/test reruns, rollback-only SQL and nine-table RLS/grants passed. Primary volumes untouched.
- [x] Purchasing/shelf flow 175 and latest safety 125 assertions passed, including added CSRF/Origin and concurrent duplicate receipt coverage; final isolated global ledger/balance mismatches = 0.
- [x] All 18 real-enabled Playwright tests and Phase 0–3 API regressions passed; Phase 4 covered 15 routes at seven widths and six screenshots were inspected.
- [x] Resolve obsolete exact schema-5 guards in five SQL test files to exact schema 7; original runner rerun passed without weakening tests or rewriting application code.
- [x] Close Phase 4 COMPLETED (Local) with actual evidence; no commit/push/deployment or Phase 5 work is included.
- [ ] Separate production gates: dedicated runtime LOGIN, TLS/secrets/SMTP, backup/restore/rollout, retention, load/hardware/accessibility and operational hardening.

## Phase 3 implementation and acceptance

- [x] Phase 3.1: real scoped terminal, one explicit stock source, search/category/barcode lookup and cart entry.
- [x] Phase 3.2: persistent cashier-owned carts, exact quantities, optimistic revisions, hold/resume and current-price acknowledgement; no reservation.
- [x] Phase 3.3: exact CASH/QR_MANUAL/BANK_TRANSFER_MANUAL quotes and explicit durable funds acknowledgement; no invented gateway confirmation.
- [x] Phase 3.4: atomic sale/items/payment/receipt/SALE ledger/balance/cash/audit; idempotent retries and durable reconciliation after posting failure.
- [x] Phase 3.5: immutable sale/receipt snapshots, scoped history/details, 58/80 mm browser printing and safe reprint/failure.
- [x] Phase 3.6: one open terminal/cashier shift, counted opening/closing cash, net cash reconciliation, pending-payment close gate and history.
- [x] Phase 3.7: RBAC/tenant/branch/CSRF/RLS/grants/immutability, oversell/transfer/count/shift races, 197 real POS assertions, 64 frontend tests, Go race/vet/build, contracts and 17 browser regressions.
- [x] Migration 6 and clean readiness verified only in isolated test/scratch databases; historical migrations and original persistent volumes unchanged.
- [x] Architecture, checkout, database, security and detailed Thai verification documentation updated; no commit/push/deployment or Phase 4 implementation.
- [ ] Production gates: approved backups/restore/migration, distinct runtime LOGIN, TLS/secrets/SMTP, hardware/load/accessibility trials and data retention.

## Phase 2 implementation and acceptance

- [x] Phase 2.1: branch-local location hierarchy, physical type/status/revision, cycle/cross-tenant denial, protected transit and safe deactivation.
- [x] Phase 2.2: Variant/location identity, exact quantities, immutable ledger, atomic/versioned balances, one-time opening and reconciliation.
- [x] Phase 2.3: delta/absolute correction, approval/posting/reject/cancel, explicit self-approval policy, stale correction denial and all-item rollback.
- [x] Phase 2.4: physical observations, zero-baseline snapshots, exact variance, submission/approval/posting and stale-version recount policy.
- [x] Phase 2.5: conserved same-branch transfer and inter-branch source/transit/full receipt, branch scope, races and idempotency.
- [x] Phase 2.6: overview/reorder/availability, ten routes, thirty API path templates, RBAC/CSRF/tenant gates and catalog/navigation integration.
- [x] Additive migration 5 applied only to smartpos-auth-test, no-change rerun; composite FKs, FORCE RLS and runtime grants verified with rollback-only SQL.
- [x] Final Go format inspection/vet/race, TypeScript, lint (three existing warnings), 58 unit tests, contracts, frontend build and 135 real inventory API assertions passed.
- [x] Final browser regression 16/16 passed, including 21 labeled inventory cases and ten routes at seven widths; selected mobile/desktop screenshots inspected.
- [x] Preserve historical records; no commit/push/deployment, original-volume migration, destructive data operation or Phase 3+ implementation.
- [ ] Production gates: least-privilege LOGIN/TLS/secrets, backup/recovery, hardware/load trials and retention/cleanup. No valuation, reservations, partial receipt or post-dispatch cancellation claimed.

## Phase 1C implementation and acceptance

- [x] Phase 1C.1: organization-scoped products/categories/brands/units, search/filter/sort/pagination, archive/restore, audit and nine real routes.
- [x] Phase 1C.2: required default or explicit saleable variants, permanent organization-unique normalized SKU, exact NUMERIC prices, validated attributes and packaging metadata.
- [x] Phase 1C.3: EAN-13/EAN-8/UPC-A/Code 128 validation, leading-zero strings, aliases, primary barcode, collision-safe internal identifiers, scanner lookup and browser-print labels.
- [x] Phase 1C.4: bounded CSV/XLSX parsing, mapping, row errors, duplicate CREATE/SKIP/UPDATE, creator-private expiring previews, revision revalidation and atomic/idempotent confirmation.
- [x] Additive migration 4, composite tenant FKs, catalog FORCE RLS and non-owner runtime grants verified in isolated test data; migration up rerun reports no change.
- [x] Go format/vet/race/build, TypeScript, lint (three existing warnings), 51 frontend tests, contracts and production frontend builds passed.
- [x] 116 real catalog API assertions include a 100-row bulk import, concurrent barcode/SKU/confirm tests, atomic rollback, RBAC/tenant denial and stale preview rejection.
- [x] All 15 Playwright tests passed; nine catalog pages at seven widths, loaded mobile/desktop screenshots and print layout inspected. Auth/organization API regression also passed.
- [x] Documentation updated without deleting earlier verification history; no commit/push/deployment, original-volume migration, destructive data operation or Phase 2 functionality.
- [ ] Separate production/hardware gates: image storage, real scanner/printer trials, load testing, durable import retention/cleanup, TLS/secrets and least-privilege production LOGIN identity.

## Phase 1B implementation and acceptance

- [x] Phase 1B.1: atomic organization/Owner/main branch/defaults/audit creation, idempotent retries, onboarding, organization selection/switching/settings.
- [x] Phase 1B.2: branch create/edit/status, branch switching, employee membership detail/role/status/assignment, removal, email invitations and acceptance/revocation.
- [x] Phase 1B.3: fixed roles, API permission checks, all-assigned-branch Manager scope, cross-tenant/branch denial, immediate API revocation and concurrent last-owner protection.
- [x] Additive migration 3 applied only to isolated `smartpos-auth-test`; runtime `SET ROLE`, composite tenant FKs, successful-change audit and rollback-only SQL checks.
- [x] Go format/vet/race/build, TypeScript, ESLint, 22 frontend unit tests, contracts, web build and real gateway integration passed locally.
- [x] All 14 Playwright tests passed, including one integrated Phase 1B scenario with 15 labeled E2E cases; six Phase 1B pages checked at seven widths. Loaded mobile branches and desktop roles screenshots inspected.
- [x] Auth regression, spoofing/rate limits, SMTP outage rollback, hashed email-bound invitations, expiry/replay/concurrency and log sanitation verified without relaxing security thresholds.
- [x] Architecture/routes/OpenAPI/security/verification documentation updated; no Phase 1C code, commit, push or deployment.
- [ ] Production gate remains separate: actual least-privilege LOGIN credentials, TLS/SMTP, deployed IPv6, durable delivery, retention and operational hardening.

## Implemented; retain and reverify

- [x] Forward-only identity migration: users, hashed sessions, one-time reset tokens, audit events and rate-limit counters.
- [x] Go registration, login, logout, current session, forgot/reset password, Argon2id, session revocation, Origin/CSRF checks and input validation.
- [x] React authentication pages, provider, protected account route, session restoration and responsive auth layout.
- [x] Frontend format, lint, typecheck, 16 unit tests, contract check and production build passed on 2026-10-09. Lint still reports two warnings.
- [x] Compose configuration, final diff checks and rerun rollback-only identity SQL assertions passed on 2026-10-09.

## P0 — required to close Phase 1A

- [x] Restored isolated Docker runtime access; original volumes/data retained.
- [x] Exact Caddy peer attribution, fixed non-conflicting proxy addresses, IPv4/IPv6 unit coverage and real gateway/direct spoofing tests passed; limits unchanged.
- [x] Repeatable real-client fixtures preserve counters and account limits; explicit 429, Retry-After and independent-client checks passed.
- [x] Current Go format/vet/race tests/build passed in the isolated check container.
- [x] Migration up rerun and rollback-only SQL checks passed at clean schema version 2; no down/drop/schema change.
- [x] Real Caddy/PostgreSQL/Mailpit auth flow, session/reset expiry and revocation, Origin/CSRF and HTTP cookies passed. Production cookie policy is unit-tested, not deployed HTTPS-tested.
- [x] Playwright passed all 13 tests: two integrated auth scenarios and 11 foundation regressions; mobile/desktop screenshots inspected.
- [x] Public reset responses enqueue before account lookup/SMTP; SMTP-outage generic responses, worker deadline and sanitized log checks passed. Best-effort queue and production SMTP/TLS limits documented separately.
- [x] Final frontend/Compose/diff checks passed; actual dated results recorded in the verification report.

## Exit gate and handoff

- [x] Phase 1A marked **COMPLETED for the local acceptance gate** after current security/functional checks passed.
- [x] API, architecture, security, local operation and verification docs updated; no production TLS/SMTP claim.
- [x] Phase 1A handoff prerequisites were recorded separately and are now implemented in Phase 1B: non-owner runtime role, authoritative organization/branch membership, tenant context and RBAC. Phase 1C remains **NOT STARTED**.

No commit, push, deployment, destructive database operation or security-limit relaxation is implied by this file.
