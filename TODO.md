# Search-first shop directory toolbar (2026-11-08)

Approved scope: Separate the heading from the primary search row; replace the
hamburger with a visible Thai/English shop-type label and chevron. On mobile,
place view controls beside the heading, full-width search below, then the filter.
Preserve existing search, filtering, Escape/focus, links and view behavior.

- [x] Inspect current changes, component/styles and safe mocked browser tests.
- [x] Update unit/browser regressions and confirm RED: 4 unit failures for
  missing labelled filter; 768px browser fails because heading shares search row.
- [x] Implement the approved layout using existing tokens and Lucide icons.
- [x] Verify focused Vitest 30/30 (ShopDirectory + StorefrontPage) and mocked
  Playwright across 10 viewports (320, 390, 540, 541, 767, 768, 1024, 1279,
  1280, 1672px) all PASS (10/10).
- [ ] Rerun full typecheck/lint/build once terminal safety classifier is available.
- [ ] Remove this section after final full-suite verification is settled.

# Shared header proportions baseline (2026-11-08)

Scope: Reuse the approved setup header proportions across shared web layouts.
Keep routes, permissions, controls, page content and responsive navigation unchanged.
No API, database, dependencies, external services or deployment changes.

- [x] Centralize 72px desktop / 64px mobile header and 36px / 32px brand marks.
- [x] Apply shared values to management, setup, storefront, landing, auth and POS.
- [x] Verify mocked Chromium layouts at 320, 640, 641 and 1440px, control bounds,
  focus outlines and page overflow; focused browser regressions PASS 64/64.
  Latest log: `.local/shared-header-recheck.log`; screenshots in matching folder.
- [x] Typecheck/build PASS; lint PASS with 0 errors / 9 warnings; contracts PASS
  (18 modules / 114 routes), log tests PASS 10/10 and dev-stack tests PASS 6/6.
  `git diff --check` PASS. Design detector: 1 warning / 2 advisories outside
  changed header rules; report `.local/shared-header-design-detect.json`.
- [?] Full web suite: 547 passed / 4 failed across restaurant-scope.test.tsx,
  SettingsPage.test.tsx (2) and StorefrontSettingsPage.test.tsx. Not repaired
  under header scope; details in `.local/shared-header-tests.log`.
- [ ] Separate visual issue: register form content clips inside its card at
  320px; header fits. Form layout is outside this task; no repair performed.
- [ ] Remove this section after unresolved acceptance items are settled.

# Shop directory business-type toolbar (2026-11-08)

Scope: Move category toggle, heading, search and layout controls into the results
toolbar. Filter real published shops by saved business type, not product category.
Add only business_type to directory responses; preserve visibility, tenant scope,
sorting, limits and function grants. No database execution without a confirmed
isolated disposable target. Rollback: migration 33 down restores directory shape;
no stored data is changed.

- [/] Add regression tests and implement API metadata plus migration 33.
- [ ] Implement responsive toolbar and accessible shop-type filters.
- [ ] Run focused Go/web tests, contracts, typecheck, build and browser checks.
- [ ] Obtain authorized independent scoped review and address findings.
- [?] Database upgrade, runtime isolation and rollback acceptance require a confirmed isolated target.
- [ ] Remove this section only after all required acceptance passes.

# Storeless account onboarding redirect (2026-11-08)

Scope: Redirect authenticated multi-store users without an organization from
`/account` to `/setup`. Preserve loading/error handling, existing memberships,
single-store restrictions, authentication and server-side authorization.

- [x] Reproduce account landing with focused routing regression tests.
  RED: direct `/account` routing test fails because Account remains visible.
- [x] Add the onboarding redirect without changing access checks.
- [/] Run focused regression tests, web tests and typecheck; review the diff.
- [ ] Remove this section after verification passes.

# Warm Gold application-wide UI (2026-11-07)

Approved scope: Apply the supplied white/cream/gold reference across the web UI,
including shared tokens, backgrounds, navigation, headers, controls, operational
pages, storefront, landing and authentication. Preserve existing user changes,
business behavior, routes, permissions, local fonts and Lucide icons. No API,
database, external assets, new dependencies, publication or deployment changes.

- [x] Inspect shared styles, layouts, page families and safe browser fixtures.
- [x] Implement shared Warm Gold tokens, shell, headers and controls.
- [x] Align operational and public page families with the shared visual system.
- [/] Run focused/full web tests, typecheck, lint and build; record failures.
  Final typecheck/build/contracts PASS; lint has 0 errors / 7 warnings.
  Focused web tests: 71 passed. Final full web tests: 472 passed / 4 failed,
  matching the four baseline failures in NavigationMenu, SettingsPage (2),
  and StorefrontSettingsPage. Logs: `.local/warm-gold/*-final.log`,
  `.local/warm-gold/unit-baseline.log`, `.local/warm-gold/contracts.log`.
  Broader public browser suite: 28 passed / 6 failed. Four failures expect
  obsolete copy in unchanged landing components/translations; two press Tab
  before React mounts the links. Readiness-aware keyboard cases pass in the
  new suite; current and HEAD CSS show the same readiness dependency.
  Evidence: `.local/warm-gold/public-browser.log`. Do not claim a full-suite pass.
- [x] Verify mocked browser states at mobile, tablet and desktop widths.
  Final Playwright: 55 passed (49 theme + 6 setup cases). Setup, dashboard,
  settings, products, kitchen queue and POS checked at 320/768/901/1024/1440;
  landing, login, registration, recovery and empty shop at 320/768/1440.
  Keyboard focus, mobile navigation, reduced motion, theme tokens and overflow
  checked. Header and 50px shop overflow regressions reproduced RED then GREEN.
  Screenshots inspected: setup mobile, settings desktop, POS mobile/tablet,
  landing desktop and fixed shop mobile. APIs synthetic; no business writes.
  Log: `.local/warm-gold/browser-final.log`; images: `test-results/warm-gold-final`.
  Limits: Chromium 156/Windows viewport emulation, not real devices/Safari/Firefox,
  screen readers, populated sale/cart states or database-backed acceptance.
- [x] Complete independent review and resolve task-related findings.
  Independent reviewer found no task-related findings, including the final
  mobile hero-selector fix. Differential check verified 50px to 0px overflow;
  320/767/768/1440 checks passed. Final `git diff --check` passed.
- [?] Full-suite acceptance remains open on the recorded assertion/readiness
  failures; unrelated test/copy maintenance is not included in this UI change.
- [ ] Remove this task section only after required acceptance passes.

# Fix TS6133 unused Building2 import in OrganizationPages.tsx (2026-11-06)

- [x] 1. Remove unused `Building2` import from `apps/web/src/features/organization/OrganizationPages.tsx`
- [ ] 2. Verify typecheck and web build succeed
- [ ] 3. Remove this temporary task section

# Standalone Restaurant Setup Redesign (/setup) without Sidebar Navigation (2026-11-08)

Approved scope: Redesign `/setup` page UI to match the user's standalone mockup reference (Image 2), completely decoupled from the sidebar menu / workspace navigation.
Includes moving `/setup` out of `RoleWorkspaceLayout` in `router.tsx`, 2-column layout with left hero panel (title "ตั้งค่าร้านอาหารของคุณ / เริ่มใช้งาน VELOPOS", subtitle, POS illustration, 3 value propositions: "ตั้งค่าร้านง่าย", "รองรับการสั่งซื้อหลายรูปแบบ", "ดูรายงานและยอดขาย"), and right step card (icon squircle, "ข้อมูลร้าน", exact form fields, placeholders, info notice callout, "ย้อนกลับ" and "ถัดไป →" buttons).
Preserve all functional logic, step validations, API contracts, and tests.

- [x] 1. Move `/setup` route outside `RoleWorkspaceLayout` in `router.tsx` to remove the sidebar menu
- [x] 2. Update `OrganizationPages.tsx` with left hero panel and right step card layout matching Image 2
- [x] 3. Update `setup.css` with standalone ambient shell, 2-column split layout, typography, squircles, and responsive styling
- [x] 4. Add centered 7-step horizontal stepper bar above `.setup-layout` matching Image 3, with standard `.topbar` header, step number badges (`1`–`7`), and horizontal connecting line (TDD)
- [x] 5. Reconcile `OrganizationPages.test.tsx`, `tests/e2e/restaurant-setup.spec.ts`, and `tests/e2e/warm-gold-theme.spec.ts` for standalone `/setup` with top stepper
- [x] Header follow-up: remove storefront link and role badge from `/setup` only; retain shared language, help and AccountMenu controls. Preserve other workspace headers.
  Fresh verification: 46 setup unit tests passed; 3 mocked Playwright layout cases passed at 320/768/1440px, including header absence assertions, keyboard focus and page overflow. Inspected desktop and mobile screenshots; removed sticky positioning after mobile capture showed the header covering content. Browser evidence uses synthetic APIs, not live database acceptance.
- [/] 6. Run tests, typecheck, lint, and build verification
  PASS: focused setup Vitest (46 tests), `npm run typecheck`, `npm run build`, and `git diff --check`. `npm run lint` completed with 0 errors / 9 warnings in other files. No blanket IDE-diagnostics pass is claimed. Broader earlier acceptance remains separate.
- [ ] 7. Complete broader visual acceptance; header layout checks at 320/768/1440px passed as recorded above
- [ ] 8. Clean up completed task section from TODO.md upon full verification

# Onboarding simplification (2026-11-06)

- [/] Align organization creation and restaurant setup with the additive
  onboarding contract: generated organization code, default main branch,
  and preservation of identifiers, organization code and omitted branch.
  Legacy explicit inputs and strict organization/branch updates remain supported.
- [ ] Reconcile the OpenAPI request shapes with the final backend and frontend
      changes and run the contract inventory check.
- [x] Main reports Go tests, vet and build passed with the database DSN unset;
      focused web checks passed 57 cases. These results precede the pending
      explicit-branch validation fix and do not establish database acceptance.
- [ ] Rerun the required Go checks after the backend and integration changes.
- [x] Main reports typecheck, web build and contract inventory passed; lint had
      zero errors and seven warnings. Recheck affected inputs after the fix.
- [x] Main reports six mocked browser cases passed at 320 and 1440 pixels;
      screenshots were inspected. Live database-backed browser acceptance is open.
- [?] Verify creation, retries, rollback and profile preservation against an
  isolated task-owned disposable database; Main reports this is blocked.
- [?] Aggregate `npm run test` FAIL: 4 failed / 475 passed in 62 web files;
  failures are NavigationMenu (1), SettingsPage (2), and
  StorefrontSettingsPage (1), outside this task. No baseline was run.
  The scoped QR export timing fix passes. Log:
  `.local/onboarding-simplification/test-final.log`.
- [x] Main reports separate `npm run test:logs` PASS (10) and
      `npm run test:dev-stack` PASS (5).
- [ ] Complete independent code and security review for the transaction and
      idempotency changes, including the pending explicit-branch validation delta.

# Owner-only backoffice (2026-11-05)

Approved scope: restrict backoffice access to active OWNER memberships; reject
MANAGER, CASHIER, INVENTORY_STAFF and PURCHASING_STAFF. Remove the `/work`
workspace and invitation, member and role administration UI and API. Retain
account/login and `/shop` ordering, all accounts, memberships and history, and
the existing schema; no migration. Size: Large. Risk: High (authorization and
tenant isolation). Recovery: reverse only this task's changes; preserve data and
unrelated work. Backend, frontend, contracts and documentation have separate owners.

- [/] Implement owner-only server policy and organization listing, retire the
      administration endpoints and update the frontend workspace and guards.
- [/] Update contracts, route inventory and assigned architecture/security docs.
- [ ] Verify owner access and non-owner denial, tenant isolation, retired routes,
      account/login and shop journeys, and preservation of existing data/schema.
- [/] Backend authority follow-up: require a current OWNER discount approver for
      new work while preserving completed replay; require an active OWNER and
      active account for new shelf assignments. Preserve historical data.
      Main reports implementation and Go checks. Final independent security
      delta review found no new confirmed defect; database runtime verification
      remains pending.
- [/] Reconcile the contract inventory to 117 routes: remove `/employees`,
      `/employees/:id` and `/roles`; retain planned, unregistered `/approvals`
      and `/audit-logs` in the employees module.
  - Main reports PASS `npm run contracts:check`: 18 modules / 117 routes after
    six OpenAPI paths and three retired inputs were removed and Role set to OWNER.
    The earlier contract assertion failure preceded that update.
- [/] Record current tests, contract checks, independent security/code review and
      browser results from Main. Acceptance remains open.
  - Main reports fresh PASS `go test ./... -count=1` (18 test packages;
    `cmd/server` has no tests) and `go vet ./...` from `apps/api` after the
    authority follow-up. Some added checks inspect query/source text and do not
    establish database runtime semantics.
  - Main reports initial `npm run test` FAIL: one of 419 tests failed on legacy
    invitation fragment cleanup in OrganizationProvider. A later frozen frontend
    run PASSed: 56 files / 414 web tests, 18 modules / 117 routes, 10 log and
    5 dev-stack tests. It emitted a jsdom `scrollTo` warning.
  - Main reports PASS `npm run typecheck`, `npm run lint` (0 errors, 5 warnings)
    and `npm run build`. Test log: `.local/owner-only-final-test.log`.
  - Final independent security read-only delta review PASS: no new confirmed
    defect. Prior approver and assignment issues were addressed; completed replay
    retains caller, tenant, key and reference checks, and new posting revalidates.
    This is not release-readiness approval. Required database integration is
    BLOCKED: Docker/PostgreSQL unavailable; query/source assertions do not prove
    SQL or replay semantics. Live acceptance must cover replay without duplicate
    effects, nonowner/foreign/inactive rejection, and assignment recovery,
    idempotency and status.
  - Main reports independent frontend/contracts code-review PASS with no confirmed
    defect. This was static/source review, not database runtime verification.
  - Main reports PASS Prettier check for the contract files and scripts, and no
    database diff. `npm run verify:organization` was BLOCKED at its safe preflight:
    it requires OWNER_ONLY_INSTANCE, a full disposable DB/API target, IDs and a
    shop slug. Docker, psql and postgres executables were unavailable in command
    discovery; no database integration acceptance is claimed.
  - The test engineer reconciled obsolete staff-positive coverage in the primary
    `tests/e2e/organization.spec.ts` using the actual `/setup` organization
    buttons. Formatting and collection passed (166 tests / 30 files); real runtime
    remains BLOCKED because the disposable binding is unverified. Broader legacy
    staff-positive domain suites, including catalog and POS, remain unreconciled.
    They have not been blanket-skipped or accepted by this task.
  - Main reported PASS: 35 mocked browser cases in 48.6 seconds using
    `tests/e2e/owner-only.spec.ts` and `tests/e2e/workspace-areas.spec.ts` with
    one worker and the fixture helper running. Log:
    `.local/owner-only-main-final-browser-2.log`. Main inspected owner/nonowner
    mobile screenshots. An earlier retry failed all 35 with ERR_CONNECTION_REFUSED
    after the helper stopped. That run preceded final test strengthening. The test
    engineer reports a subsequent PASS of 35 mocked cases on the frozen test
    source (`.local/owner-only-review-browser`) after restoring public private-
    request rejection, pageerror and Escape/focus checks. Final collection log:
    `.local/owner-only-review-collection.log`. Final independent test delta review
    PASS: no confirmed defects; restored checks and setup selectors were reviewed,
    with no new skips. Mocked APIs do not establish real backend acceptance.
  - Main reports current PASS `git diff --check` and Prettier checks for tests
    and contracts.

Historical source observation (superseded by the restaurant flow continuation):
storefront/orders.go handled a missing payment attempt by setting hasPayment=false,
so the payment/hold/refund/reconciliation checks in that transition branch were
skipped. No application fix or runtime reproduction was performed in that
skill/rules task; follow-up acceptance remains separate.

# Project policy alignment (2026-11-05)

Scope: align the five project instruction/skill-policy files with governing
engineering policies without copying global rules or a machine-specific global
inheritance sentence/path. Preserve SmartPOS constraints and unrelated work.
Size: Medium. Risk: High (delegation, authorization and review requirements).
Main owns this section and validation; documentation-engineer owns the five
policy files; an independent code-reviewer checks the final policy diff.
No runtime, global configuration, database, commit, push or deployment changes.
Recovery: reverse only this task's hunks; preserve the existing roadmap and edits.

- [x] Reconcile the approved draft, instruction scope, Git status and file hashes.
- [x] Inspect baseline policy-consumer decisions: backend ownership, auth/tenant
      review, local versus production DB authority, read-only diagnosis and trackers.
  - Baseline: the consuming agent chose the governing-policy actions but identified
    conflicting Main-only, separate review approval and mandatory TODO cleanup
    rules. This is conflict evidence, not an observed runtime delegation failure.
  - Before edits: skill validator tests passed 10/10 and skill validation passed.
- [x] Update AGENTS.md, CLAUDE.md, .agents/skills/README.md,
      .agents/skills/diagnose/SKILL.md and diagnose adaptation metadata in sources.json.
- [x] Repeat policy-consumer scenarios and run local skill validation, references,
      scoped formatting/provenance checks and git diff --check.
- [x] Resolve independent review findings and retain verified acceptance evidence.
  - PASS: node --test .agents/skill-support/validate.test.mjs (10/10),
    node .agents/skill-support/validate.mjs, scoped existing Prettier --check for
    the five policy files, and git diff --check.
  - PASS: independent code-reviewer re-reviewed the actual five-file policy diff.
    Its initial P2 duplication finding was fixed by removing generic root workflow
    and replacing CLAUDE/README task lists with the project guide reference.
  - PASS: five fresh policy-consumer decisions preserve backend specialist use,
    mandatory high-risk review, local/production authority, read-only diagnosis,
    and proportionate tracker handling. These interpretations are not measured
    runtime delegation or proof that a host has reloaded instructions.
  - PASS: source identities and snapshot hashes are unchanged; only diagnose
    adaptation wording changed. Architecture/map, retail invariants and UI/AI
    boundaries match baseline. The forbidden inheritance sentence/path is absent.
  - PASS: original TODO remainder and all 12 unrelated changed/untracked files
    match preservation hashes; global AGENTS.md is unchanged.
  - Resolved check/tool failures: Windows multiline patch transport and an
    incorrect executable path failed before writes; supported Node/apply_patch
    transport succeeded. A CLAUDE trailing blank line was corrected. A comparison
    helper initially used the old routing heading; corrected boundaries passed.
  - No application, browser or database tests: policy-only scope. No new tests
    that merely grep prose, no runtime edits, no commit, push or deployment.

# Restaurant-only consolidation (2026-11-04)

Approved scope: execute the restaurant-only plan on feature/fix-flow-system.
Keep dine-in QR, pickup, delivery, payment-before-kitchen, recipes/ingredients,
sales/refunds, forecasting and feedback. Remove unrelated retail interfaces and
retire unused backend entry points only after replacement/dependency checks.
Preserve historical records, existing task sections and authorization boundaries.
No commits, branch changes, provider requests, deployments or primary DB changes.

- [x] Inspect current branch, dependencies and current acceptance gaps.
  - Branch remains feature/fix-flow-system. Existing recipe-aware POS/inventory engines still have live callers; no backend or database changes made.
  - At that checkpoint, forecast remained FORECAST_NOT_CONFIGURED and the storefront customer payment gateway was not wired in transport/router.go. The later continuation wired the gateway.
- [x] Define and run failing tests for restaurant-only navigation/routes.
  - RED/GREEN logs: .local/restaurant-consolidation/red-scope.log and scope-iteration.log; current full frontend suite passes.
- [ ] Consolidate restaurant workspaces and remove unused retail screens.
  - Completed UI slice: restaurant task dashboard replaces fabricated metrics; retail navigation/routes and catalog brand/barcode/import/label tools removed.
  - Deleted nine orphan purchasing/pricing/adjustment screen files. Historical sales/adjustment/return data remains visible without retired action links.
  - Retired URLs are tombstoned in bare/manage/work namespaces; positive tests preserve restaurant, quality, sales/refund and public cart/tracking routes.
  - Partial: POS/shift/checkout remain until shared restaurant order/payment replacement passes; additional unmounted legacy source and live backend modules are not yet retired.
- [ ] Complete shared ordering/payment and paid-only kitchen acceptance.
  - Current continuation: public customer payment routes, paid-before-kitchen guards and the staff prepaid settlement action have been implemented. The isolated QR and pickup browser flows passed with a simulated provider; full acceptance remains open.
  - Wired CustomerPayments into transport.Options, cmd/server/main.go, and storefront.Service.
  - Kitchen queue (restaurant.Service.Queue) query strictly requires verified PAID payment attempt with hold not released, and excludes active refund intents and fulfillment review reconciliations.
  - Transition in storefront/orders.go strictly enforces verified payment before orders can enter PREPARING or READY.
  - readOrder accurately reflects payment_status as paid when online payment attempt is PAID.
  - pos.SettlePrepaidOnlineOrder accounts for frozen shipping fees in total validation (cartTotal + shippingFee == expectedTotal).
  - Historical offline evidence: go test ./... -count=1 and go vet ./... passed; unit tests added in queue_test.go and online_orders_test.go. These checks alone do not establish full payment or kitchen acceptance.
- [ ] Complete ingredient reservation/consumption and restaurant recovery.
  - Historical continuation HND-20261105-004600 (2026-11-05): ingredient snapshot/reservation/deduction only. The later restaurant flow continuation extends into browse, payment and UI.
  - [x] Inspect order, recipe, quality, payment and sale transaction boundaries.
  - [x] Add failing reservation/snapshot/settlement regression coverage.
    - RED/GREEN: frozen-recipe Go tests first failed compilation before their resolver existed; schema readiness failed at 27 before RequiredVersion 28. Review regressions reproduced ambiguous order/cart lookup, missing SQL source boundaries and per-movement whole-order expansion, then passed after fixes. SQL source checks are not SQL execution.
  - [/] Implement immutable order ingredient snapshots and atomic reservation/consumption.
    - Migration 28 snapshots recipe ingredients/direct stock, preserves exact quantities and RLS, aggregates shared holds and enforces matching sale operations. POS settlement reads frozen snapshots; order/cart exclusion paths are distinct. Live orders must be drained/reconciled before upgrade; primary data was not migrated.
    - Historical browse gap against HEAD is superseded by recipe-aware browse changes and isolated database coverage below.
  - [x] Verify shortage, release, retry, concurrency and tenant boundaries on an isolated database.
    - PASS (2026-11-05): .local/restaurant-flow-20261105/live-return-final.log records the isolated SQL suite passing, including recipe browse, ingredient reservations, shortage, RLS, concurrency, refund and prepaid settlement cases. The earlier unavailable-tool/DSN blocker and skipped run are historical.
    - PASS: migration 28 refused live orders atomically, dirty version 28 recovery on a disposable clone returned to 27, and the 27-to-28 upgrade preserved historical orders and reran unchanged.
    - PASS: migration 29 adds the three customer payment rate-limit scopes required after browser checkout returned 503 against the migration 14 whitelist; migration 28 remains unchanged. Isolated checks covered scope insert/update, unknown-scope rejection, existing auth and order history, down refusal and dirty-version recovery, down/up and unchanged rerun.
    - PASS at the earlier live-schema29 snapshot: actual QR and pickup browser flows (2 passed); delivery was skipped. Staff handover observed 0.200 ingredient deducted, the hold released, one sale and safe replay. The provider was simulated. Task-owned database fixtures and network were cleaned up; no primary database was used.
    - Historical FAIL in live-final.log: both browser cases failed when aborted provider navigation caused a Chrome error page to interrupt the local return. This did not establish an application failure. The subsequent live-return-final.log passed using synthetic provider HTML.
    - PASS in live-return-final.log: migrations 28 and 29, isolated SQL groups and actual checkout, recover and status rate-limit middleware tests passed. Real browser QR and pickup flows passed (2); delivery was skipped (1). Synthetic provider HTML, local return and tracking restoration passed, with exactly 0.200 kg deducted, one sale and movement, and replay. The provider was simulated; no real Stripe call or primary database was used. Task-owned database fixtures and network were cleaned up.
    - BLOCKED: complete delivery flow needs a shipment service and an unanswered product decision on the shipment step. Migration 22 prohibits POS posting before shipment; do not bypass it. Real provider acceptance remains unverified.
    - PASS at the recorded snapshot: frontend build, .local/restaurant-flow-20261105/build-final.log. tests-final.log records 54 frontend files / 392 tests, contracts 18 modules / 120 documented routes, 10 log tests and 5 dev-stack tests. Typecheck and lint exited 0; lint reported 0 errors and 5 warnings (typecheck-final.log and lint-final.log).
    - PASS at the schema29 snapshot: go test ./... -count=1 covers 18 packages, including one with no test files; go vet ./... and go build ./... exited 0. Evidence: .local/restaurant-flow-20261105/{go-schema29,go-vet-schema29,go-build-schema29}.log. Race detection was not run: CGO_ENABLED=0 and gcc/clang were not on PATH.
    - PASS: independent reviewer Dirac re-reviewed the current reviewed scope, verified the OpenAPI 409 quote and rate-limit middleware test fixes and provider boundary, and inspected live-return-final.log. No unresolved P1/P2/P3 findings in that scope; delivery and real provider acceptance remain open.
    - PASS: fresh root npm run test (tests-return-final.log): 54 frontend files / 392 tests, contracts 18 modules / 120 documented routes, 10 log tests and 5 dev-stack tests. A separate contracts:check also passed (contracts-return-final.log). Main reported scoped gofmt -l on changed/new Go files produced no output, git diff --check passed, and node --check passed for the browser spec and harness.
    - Focused mocked browser checks passed 10 cases; the live QR/pickup result above is separate. The earlier full workspace browser run (21 passed / 11 failed) remains unresolved and is not established as pre-existing.
  - [x] Run focused/full Go checks and authorized independent source review; retain unresolved gates.
    - PASS (2026-11-05): go test ./... -count=1; go vet ./...; go build ./... from apps/api; npm run contracts:check (18 modules / 120 routes); scoped gofmt check; git diff --check. Logs: .local/ingredient-reservation/. Go suite success includes skipped isolated DB acceptance.
    - Historical source review: independent reviewer rechecked the scalar requirement helper/guard, resolved four original source findings and found no new source blocker. The later isolated SQL run and current continuation review are recorded above. Race detector was not run in that earlier continuation because CGO_ENABLED=0; release readiness remains unverified.
  - [ ] Clean up only this continuation checklist after acceptance passes.
- [ ] Retire orphan retail API/contracts after replacement acceptance.
- [ ] Implement reports, bounded forecast/backtesting and manager feedback.
- [ ] Run focused and full applicable checks, browser and isolated DB acceptance.
  - PASS (2026-11-05): npm run test -- 52 frontend files / 355 tests, contracts 18 modules / 120 routes, logging 10 tests, dev-stack 5 tests.
  - PASS: npm run typecheck; npm run lint (0 errors, 5 warnings); npm run build; git diff --check.
  - PASS: focused Playwright workspace-areas restaurant/navigation checks, 15 cases; mocked API only, 320/768/1440px restaurant screenshots inspected.
  - Main reviewed the affected UI diff, route precedence and retained historical display. Task-owned Vite server on port 15179 stopped after verification; no independent review claimed.
  - FAIL: full workspace-areas Playwright run, 21 passed / 11 failed; public entrance, customer disabled-order button, navigation/redirect and POS header expectations need triage. Not established as pre-existing.
  - NOT RUN: Go/database/real payment/whole-flow acceptance; no backend changes or confirmed isolated database target in this slice.
  - Evidence: .local/restaurant-consolidation/{full-tests,typecheck,lint,build,browser,browser-full}.log.

# Restaurant settings redesign (2026-11-05)

Approved scope: Redesign the settings page to match the VELOPOS restaurant settings design mockup.
Includes Store Info (name, type, logo, phone, email, address, description, photos),
Service Modes (dine-in/takeaway/delivery), Operating Hours & daily reporting cycle,
Payment Channels (cash, credit/debit, QR PromptPay, e-wallet, others),
Tables & QR Ordering toggle cards, and POS Hardware Devices (terminals and printers).
Preserve existing tests and contracts.

- [x] 1. Create SettingsPage component with 2-column layout matching the mockup
- [x] 2. Create settings.css for pixel-perfect typography, tokens, badges, and layout
- [x] 3. Wire settings routes (/settings, /settings/store, /restaurant/settings)
- [x] 4. Add unit tests for SettingsPage covering rendering, field updates, and interactions
- [x] 5. Verify all frontend tests pass and visual integrity is preserved
- [x] Obtain authorized independent review for payment, permissions and data integrity.
  - User explicitly authorized independent review agent ("อนุญาตให้ใช้ independent reviewer agent").
  - Independent review agent (Copernicus) completed architectural and safety review:
    1. P1: Recipe ingredient reservation gap identified.
    2. P1: Paid-only kitchen enforcement gap identified -> implemented and verified in queueQuery and Transition.
    3. P1: Delivery shipping fee settlement mismatch identified -> implemented and verified in SettlePrepaidOnlineOrder.

# Online storefront settings (2026-11-06)

Approved scope: Add a dedicated "หน้าร้านออนไลน์" (Online Storefront Settings) page at `/settings/storefront` matching the VELOPOS UI design with a responsive 2-column layout, and add a navigation button from the main `/settings` page.
Includes Storefront Enable/Disable toggle, Details (store name, slug URL with .velopos.com suffix, description with char counter), Order Channels (Takeaway, Delivery, Dine-in), Storefront Appearance (6 theme colors, logo/cover upload), Online Order Hours (store hours vs custom online hours), and Store Link & QR Code display (copy URL and download QR code).
Preserve existing tests and contracts.

- [x] 1. Route setup and navigation button in SettingsPage (/settings -> /settings/storefront)
- [x] 2. Implement StorefrontSettingsPage component with all 6 cards and actions
- [x] 3. Implement storefront-settings.css with responsive 2-column styling matching mockup
- [x] 4. Unit tests covering all StorefrontSettingsPage interactions and SettingsPage navigation
- [/] 5. Run typecheck, lint, and full test suite verification (waiting for classifier to run terminal commands)
    4. P1: Runtime CustomerPayments wiring gap identified -> implemented and verified in router.go, main.go, and storefront.Service.
    5. P2: Order tracking payment status reporting identified -> implemented and verified in readOrder.
    6. P2: Payment recovery edge cases identified.
- [ ] Remove only this task section after all acceptance gates pass.

Execution decisions:

- Use the current branch, already based on restaurant commit 440bafd; no merge or branch switch.
- Use this existing tracker instead of creating additional plan/ledger files.
- Do not drop historical tables or remove the payment/stock engine while callers remain.

# Restaurant Ordering and Forecast Flow

- [x] Inspect current storefront, POS, inventory, payment, and AI boundaries
- [ ] Define acceptance tests for dine-in QR, online delivery, queue, and backoffice flow
  - Current QR slice: reject invalid/inactive/cross-branch table tokens; bind quote/order to the same table; preserve idempotent replay and token privacy.
  - Verify table context survives catalog/cart navigation and appears in quote, order tracking, and paid-order queue.
  - Database acceptance requires a confirmed isolated target; do not apply migrations to the primary database.
- [x] Implement restaurant-oriented navigation and re-verify focused workspace/navigation suites
- [x] Repair restaurant settings, recipe/table idempotency, quick-stock ledger path, migration 24 syntax, OpenAPI, and contract check
- [ ] Verify recipe quantities, stale revisions, branch scope, stock idempotency, and real SQL
- [x] Implement recipe/settings/quick-stock/table/queue/forecast-status screens using existing UI and ledger permissions
- [x] Generate stable queue numbers per configured business period without resetting stock or rewriting order history
  - Baseline: queue used row_number over active orders, so numbering changed after an order left the queue. Local code now reads stored numbers; isolated SQL acceptance passed on 2026-11-04. This does not certify primary/retained-data rollout.
  - Queue continuation (2026-11-04): migration 27 draft, specialist delegation, and execution on a newly created isolated acceptance database are authorized. Primary/retained databases, production rollout, and backfill remain out of scope.
  - [x] Reconcile HND-20261104-023817, current Git changes, queue/settings/order transaction ownership, and the existing test harness.
  - [x] Define queue acceptance and reproduce unit-level period/allocation boundaries: closing-time rollover, midnight, deferred settings changes, replay, scoped lookups, persistence errors, and numbers above 999.
  - [x] Implement additive migration 27 and transactional order allocation; preserve legacy WEB numbers without backfill, new stock writes, or historical rewrites.
  - [x] Verify focused Go tests, readiness/contract checks, formatting, and Main's review of the actual code/diff.
  - [x] Complete independent read-only review of the durable queue and draft migration 27. One code-reviewer found a P3 OpenAPI description mismatch; no confirmed P1/P2 findings. Review did not execute tests or SQL and is not runtime acceptance.
  - [x] Resolve the P3 queue contract descriptions and add regression guards without changing DTOs, authorization, runtime, or migration SQL. Main verified the corrected contract and checker diff; the completed follow-up checklist was removed.
    - RED/GREEN: npm run contracts:check first rejected the stale endpoint description, then passed with 18 modules and 120 routes after the two description fixes.
    - PASS: node --check scripts/check-contracts.mjs; node_modules/.bin/prettier.cmd --check scripts/check-contracts.mjs packages/contracts/openapi.yaml; git diff --check. The first formatting check flagged the new pattern-array layout; a narrow correction passed the rerun. No new Go, browser, or DB tests were run for this contract-only follow-up.
  - [x] Verify SQL/RLS/concurrency on a newly created isolated database; preserve acceptance evidence here after removing the completed temporary checklist.
    - Authorized target: check-single-store.mjs creates a randomly named, task-labelled tmpfs PostgreSQL 17 container on 127.0.0.1:15514 with database smartpos_single_store_acceptance, applies the official chain, and removes only its own disposable fixtures/network after ownership checks. Existing databases and volumes must not be reused or migrated. No primary data is involved; recovery is to discard and recreate this task-owned fixture.
    - PASS: npm run verify:single-store applied official migrations 1-27 and passed a no-change rerun, then the complete TestSingleStoreIsolatedDatabase suite passed (5.294s). Latest log: .local/queue-db-acceptance/acceptance-clock-fixed-20261104-163414.log. Both task-owned tmpfs container and network cleanup passed. No primary/retained database was accessed, migrated, reset, or used for fixtures.
    - Queue acceptance: 17 leaf cases passed (8 business, 9 schema). Coverage includes independent allocator transactions with an observed advisory-lock waiter, rollback/replay, frozen settings and rollover, tenant/branch rejection, immutable snapshots/counters, paid-only queue stability, cancellation history, unchanged stock quantities, and paid ticketless legacy WEB numbers/current-period filtering. The runtime role is non-superuser/NOBYPASSRLS; period WITH CHECK is exercised. Foreign ticket insertion is rejected by a pre-policy guard; this is not direct execution proof of ticket WITH CHECK.
    - Specialists: test-engineer owned queue_integration_test.go; database-engineer owned queue_schema_integration_test.go; Main owned harness integration and execution. Independent code-reviewer completed read-only review with no confirmed P1/P2. Its P3 default-closing-time fixture issue was fixed by setting DB-clock-relative UTC closing time through SaveSettings before initial orders; narrow re-review found no remaining issue. Main reran the final patch successfully. All specialists are closed.
    - Resolved fixture failures remain recorded: expanded-25691104-161511.log hit missing cloned items/snapshots (23514) and a ticket PK masking an intended FK (23505); expanded-fixed-20261104-162304.log hit the existing opening-history guard (23514). Fixes copy complete order items/snapshots, use a fresh order for the FK assertion, and top up via ADJUSTMENT_IN. No production guard or assertion was weakened. Intermediate acceptance-20261104-162637.log also passed (5.404s), before the clock-stability improvement. All logs are under .local/queue-db-acceptance; failed-run cleanup passed.
    - Latest offline checks passed: go test ./... -count=1; go vet ./...; go build ./... (apps/api, DSN removed only from the child process); scoped gofmt -l produced no output. npm run contracts:check passed (18 modules/120 documented routes); node --check scripts/check-single-store.mjs and scoped Prettier checks passed. Race detection was not run: CGO_ENABLED=0 and no gcc/clang; no compiler installation attempted. No browser/provider acceptance is implied by these backend checks. Waiting across an actual closing boundary and direct competing allocators that both commit were not separate database scenarios; contention/rollback and rollover were tested separately.
    - Migration 27 adds restaurant_queue_periods and restaurant_order_queue, scoped uniqueness/FKs, RLS, immutable period bounds/tickets, and a monotonically advancing counter. RequiredVersion is 27; execution was approved and completed only on the new disposable target. The new UNIQUE constraint on online_orders builds an index; primary/retained-data rollout still requires explicit target approval, backup and lock-impact assessment, and a forward-recovery plan. Backfill, deployment, commit and push were not performed.
  - RED/GREEN in this queue continuation: new queue tests first failed because queuePeriod/AssignQueueNumber/queueNumber were missing, then passed after implementation. The readiness regression failed for schema 26 versus draft 27, then passed with RequiredVersion 27.
  - PASS in this queue continuation (apps/api, offline): go test ./internal/modules/restaurant ./internal/modules/storefront ./internal/platform/database -count=1; go test ./... -count=1; go vet ./...; go build ./.... SMARTPOS_SINGLE_STORE_TEST_DSN was removed only from each validation process environment, forcing the guarded DB harness to SKIP without connecting.
  - PASS: npm run contracts:check (18 modules/120 documented routes); git diff --check; gofmt -l on all Go files changed in this continuation produced no output. Static migration tests are source assertions, not SQL parsing/execution or isolation/concurrency acceptance.
  - Historical checkpoint after the test-parameter rename (2026-11-04): focused/offline Go, contracts, diff and formatting checks passed; the DSN-unset database run skipped. The later real isolated SQL/RLS/concurrency acceptance and independent review recorded above supersede that checkpoint's blocker, not the broader restaurant roadmap.
- [x] Complete QR table link UI and matching public API schemas
  - Use only the creation response token and the authorized storefront settings for the same branch; never fabricate a slug or expose tokens from table lists.
  - Verify creation, branch mismatch, permission denial, and settings-error recovery with focused component tests.
  - RED/GREEN: missing table link, permission/error states, dine-in queue label, and QR contract assertions failed before implementation and now pass. Additional tests cover empty/duplicate/malformed QR and unavailable storefront settings.
  - Historical QR verification: static readiness regression caught RequiredVersion 24 versus latest drafted migration 26; that slice passed with RequiredVersion 26, without executing a migration at that checkpoint. The queue continuation now requires 27 and the isolated chain has passed. Existing older primary/retained schemas remain unchanged and will remain not ready until an approved rollout.
  - This completes link UI and static contracts, not a generated QR graphic or real database acceptance.
- [ ] Implement shared restaurant order and queue behavior
- [ ] Implement menu recipes, stock updates, and shortage visibility
- [ ] Implement bounded next-day menu and ingredient forecast with manual approval
- [ ] Add focused frontend, API, database, and AI regression checks
- [ ] Run verification, review the diff, and remove this task section after acceptance
  - Historical QR continuation results (before HND-20261104-023817): go test ./... -count=1 and go vet ./... (apps/api); npm run test --workspace @smartpos/web (51 files, 340 tests); npm run contracts:check; npm run typecheck; npm run build; npm run test:logs (10 tests); npm run test:dev-stack (5 tests). Current queue verification is recorded under the queue task.
  - npm run lint: zero errors, five warnings in AuthProvider, OrganizationProvider, AuthPages, and ShopCatalog. No unrelated warning fixes applied.
  - Main reviewed the QR implementation/diff; git diff --check passed. Native Git reports CRLF-to-LF normalization warnings, not whitespace errors.
  - Historical QR-only checkpoint: TestSingleStoreIsolatedDatabase skipped with its DSN unset. The subsequent queue task ran the complete isolated database harness successfully, as recorded above; that does not establish the unfinished QR/delivery/browser/forecast whole-flow acceptance.
  - Historical QR limits: browser E2E/visual acceptance and independent review were not run in that slice. The subsequent queue-only static review is recorded under the queue task; the broader flow remains unverified and is not release-ready.

# Task: Recreate Login Design Matching User Screenshot Reference

## Objective

- Match the exact visual layout from user screenshot:
  1. Left Column (`auth-split-visual`): Warm beige/cream background, Brand logo at top, Thai slogan "จัดการร้านให้ง่ายขึ้น" with subtle yellow hand-drawn underline accent, sub-headline, and 3D retail POS counter illustration (Monitor + thermal receipt printer + receipt paper + potted plant + shop canopy in background).
  2. Right Column (`auth-split-form`): Clean white panel with top toolbar (Back link "<- กลับหน้าหลัก", Language switcher pill), centered modern rounded Card containing:
     - Heading: "ยินดีต้อนรับกลับ"
     - Subheading: "เข้าสู่ระบบสำหรับเจ้าของร้าน ผู้จัดการ และพนักงานเพื่อจัดการร้านค้าและยอดขายของคุณ"
     - Soft tinted input fields (`#f0f4f9` background, no borders/soft border, no hard icons in the input box) with labels "ที่อยู่อีเมล", "รหัสผ่าน" and internal "แสดง" toggle button
     - Warm golden primary button: "เข้าสู่ระบบ" with subtle rounded corners and shadow
     - Bottom row: "ลืมรหัสผ่าน?" on left, "สร้างบัญชี" on right.

## Scope & Affected Components

- `apps/web/src/layouts/AuthLayout.tsx`
- `apps/web/src/features/auth/AuthPages.tsx`
- `apps/web/src/styles/global.css`

## Implementation Checklist

- [ ] Phase 1: Form & Component Updates
  - [ ] Update `apps/web/src/layouts/AuthLayout.tsx` to support the two-column split screen with the POS illustration on the left
  - [ ] Update `apps/web/src/features/auth/AuthPages.tsx` login form elements and labels to match the clean rounded design
- [ ] Phase 2: CSS Styling
  - [ ] Update `apps/web/src/styles/global.css` with exact colors, typography, soft input backgrounds, pill buttons, and responsive breakpoints
- [ ] Phase 3: Verification
  - [ ] Run `npm run typecheck`
  - [ ] Run `vitest run AuthPages`
  - [ ] Run `npm run build`
  - [ ] Cleanup TODO.md

