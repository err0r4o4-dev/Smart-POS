# Restaurant without legacy POS (2026-11-15)

Organization quote prerequisite (2026-11-16, baseline 57e7106): Main owns an
internal authenticated quote service and registry-only pricing. No HTTP route,
schema, UI, order/payment writes or draft publication. Architect and independent
supplied-source review are authorized without reviewer tools or subdelegation.
Preserve all pre-existing tracker edits and historical records.

- [x] Prove exact organization menu quotes, fulfillment/quantity validation,
      OWNER/verification/tenant boundaries and unchanged closed drafts with TDD.
- [x] Implement transaction-scoped registry pricing without branch/stock/POS.
- [x] Verify focused real isolated DB, legacy regressions, Go and contracts.
- [x] Complete scoped independent source/evidence review; no confirmed findings.
- [?] Native Go race remains blocked by missing CGO/compiler support. DB/CSP
      regression failures are repaired and freshly verified; organization order
      snapshots, settlement and whole-flow browser acceptance remain pending.
      Do not close the whole flow.

Current evidence (2026-11-17): full isolated PostgreSQL acceptance PASS (5.63s),
Go test/vet/build PASS, root tests PASS: web 90 files/756 tests, contracts
18 modules/115 routes, log-format 10 tests and dev-stack 7 tests. The test-only
repair preserves current OWNER-only/retired-invitation policy and verifies
post-provider revocation without checkout, sale or journal writes. Independent
supplied-source re-review resolved both coverage findings without reviewer tools
or test execution. Exact commands, prior failures, scope and evidence paths are
in the existing plan's regression acceptance repair checkpoint. Earlier catalog
and quote failure records below are historical, not the current regression result.
Public cutover/browser/settlement and native race remain unaccepted.

Recovery: remove only this source delta before operational cutover. Existing
drafts remain closed; direct order snapshots and settlement acceptance stay pending.

Private organization catalog slice (2026-11-16): Main implements registry-only
managed reads for verified owners, with exact menu prices and no infrastructure
dependency. Keep publication, ordering, legacy catalog and UI unchanged. Separate
supplied-source independent review authorized; no reviewer tools or delegation.





- [?] Whole-flow regression acceptance remains unmet: full isolated DB has four
  failing leaf cases; root web tests have ten failures. No fresh baseline
  comparison establishes whether these failures predate this slice.

Slice evidence (2026-11-16, Asia/Bangkok): `go test ./... -count=1` in `apps/api`
passes 17 tested packages with `GOPROXY=off` and DB/browser variables empty.
Scoped `go vet` for storefront, restaurant and platform/database passes. These
Go package runs skip DB/browser acceptance. `npm run contracts:check` passes
18 modules/115 routes. Scoped gofmt, OpenAPI Prettier and diff whitespace pass.
Evidence: `.local/restaurant-private-catalog-final-go.log` and
`.local/restaurant-private-catalog-final-vet.log`.

With `RESTAURANT_SOURCE_FOCUSED=1` and baseline empty,
`node .local/restaurant-catalog-db-check.mjs` passes real PostgreSQL17.6 acceptance
after official migrations1-39 using the runtime role on task-owned tmpfs (1.94s;
branchless organization0.71s). Registered-only reads, exact price, JSON flags,
25-item pagination, saleability and access denials pass. Legacy focused groups,
empty down/reapply37-39, populated down refusals and owned cleanup pass.
Evidence: `.local/restaurant-private-catalog-final-focused.log` and
`.local/restaurant-private-catalog-db.log`.

The same runner without the focused flag fails full DB acceptance (4.85s):
directory storefront constraint `storefronts_check` (23514), foreign invitation,
pinned invitation and reconciliation authority-revoked-during-GET expectation.
Branchless organization passes (0.67s); task-owned cleanup passes. Evidence:
`.local/restaurant-private-catalog-final-full.log` and
`.local/restaurant-private-catalog-full.log`.

`npm run test` fails at the web step: 732 pass/10 fail across three failed files
(SettingsPage1, ShopCartPage1, StorefrontPage8). Its remaining chained checks did
not run; contracts passed separately. Evidence:
`.local/restaurant-private-catalog-root-test.log`. Full Markdown Prettier checks
still warn on untouched TODO/plan sections; no broad reformat was applied.
Whole-flow browser acceptance and release readiness remain unmet. This slice
does not enable ordering, publication or direct settlement.

Recovery: source-only rollback of this slice; no migration or retained-data writes.

Scope: Large / High. Full replacement approved in chat. Preserve user-owned
setup/address work, tenant scope and immutable financial history.
Plan: docs/superpowers/plans/2026-11-15-restaurant-without-legacy-pos.md.
Preserve historical records and unresolved old transactions.
User clarification (2026-11-15): one restaurant per organization, no branches in
the new flow. Do not create/select a hidden default branch to satisfy old APIs.
Keep organization-scoped authorization and historical branch references only
where legacy records and unresolved legacy transactions require them.



- [/] Make storefront and new orders organization-scoped, without branch,
      terminal prerequisites; update the interim source validation.
- [/] Replace setup's implicit branch selection with organization-scoped
      restaurant configuration, dining zones/tables and durable command replay.
      Internal API and client support now exist; legacy tables are untouched.
      No-infrastructure setup, isolation, concurrent replay and failure rollback
      pass isolated DB acceptance. Public creation/UI cutover remains pending.
- [/] Add organization-scoped setup menus with an explicit catalog registry.
      TDD: optional branch validation, concurrent replay, exact price, no legacy
      infrastructure, foreign/legacy rejection and rollback. Keep explicit legacy
      setup unchanged; add guarded command-schema migration before integration.
      Review source/contract/DB evidence independently before closing this slice.
      Implementation and focused acceptance pass; whole-flow and cross-workflow
      catalog interaction acceptance remain pending. See checkpoint below.
- [ ] Add cash evidence and direct atomic order sale/receipt settlement.
- [/] Add organization-only storefront drafts without terminal identities.
      Preserve legacy settings and forbid source-mode conversion. Keep new drafts
      unpublished and closed until direct order/payment acceptance. Verify owner,
      tenant scope, revisions, races, SQL guards and guarded migration recovery.
- [ ] Replace POS UI; retire shift callers after replacement acceptance.
- [ ] Verify isolated database compatibility, races, scope and failure recovery.
- [ ] Verify browser behavior and independent review.

No primary migration, deployment, push, historical deletion or external payment
request. No whole-flow acceptance claimed yet.

Current evidence (2026-11-15): focused real PostgreSQL 17.6 acceptance PASS after
official migrations 1-36 on a fresh task-owned tmpfs database. MENU_ONLY accepts
inactive terminals but rejects inactive branches; unpaid preparation is denied.
Independent supplied-source/evidence review: no findings
for this source-boundary slice only; the reviewer did not execute tests.
Fresh Go storefront/restaurant/pos package regression tests PASS with DB/browser
environment unset; these package runs do not replace the real DB check above.
Scoped gofmt and git diff --check PASS. Browser acceptance remains pending.
This evidence predates the no-branch clarification. The existing active-branch
check is an interim implementation, not acceptance of the clarified new flow.

Full isolated suite FAIL: four leaf cases (directory storefront constraint,
foreign invitation, pinned invitation, reconciliation authority revocation).
The same four failures reproduce using HEAD Go source overlays on another fresh
database. Causes are unresolved; no unrelated repairs or release readiness claim.
Evidence: .local/restaurant-source-db-check.log (focused PASS),
.local/restaurant-source-db-full-current.log and
.local/restaurant-source-db-baseline.log (matching FAILs). Task-owned containers
and networks were removed after ownership-label verification.

Branchless creation slice (2026-11-15): `organization.Service.CreateRestaurant`
creates only the restaurant organization, OWNER membership, creation key and audit
in one transaction. The existing public creation endpoint and setup UI are not
switched yet: setup/settings/orders still need their organization-only replacement.
Legacy Create still creates its original branch. No hidden branch is created by
CreateRestaurant; no migration or primary data write is part of this slice.
The branchless method has no public route until setup cutover is ready.

Fresh slice evidence: Go organization/storefront/restaurant/pos tests PASS with
DB/browser environment unset; organization/storefront vet PASS. Legacy creation
golden bytes PASS against both HEAD 5778391 source overlay and current source.
Real PostgreSQL 17.6 tmpfs, official migrations 1-36 and runtime role: branchless
creation plus menu-only and legacy-source suites PASS (1.90s). Includes four
concurrent same-key requests, one audit/no infrastructure, changed-payload
conflict, foreign-user and unverified-user denial, and the pinned-store gate.
Evidence: .local/restaurant-branchless-organization-db.log. Task-owned DB/network
removed after label checks. Independent supplied-source/evidence review found no
material blocker for this internal primitive; reviewer did not run the checks.
Public setup, branchless orders/settlement and browser acceptance remain pending.

Latest recheck (2026-11-16, Asia/Bangkok): all four affected Go packages and scoped
vet PASS; formatting and diff whitespace checks PASS. Full isolated DB suite FAIL
with the same four leaf cases recorded against HEAD baseline. Branchless creation
PASS (0.20s), including concurrent replay and unverified-user denial. Existing
pinned/default membership list PASS after separating the new fixture's owner;
its original two-organization assertion is unchanged. The first full attempt
exposed that fixture spill and was corrected, not classified as a baseline fault.
Current full log: .local/restaurant-branchless-organization-full.log. Its task-owned
container/network were removed. Whole-flow release readiness remains unverified.

Organization setup checkpoint (2026-11-16, Asia/Bangkok): migration 37 adds typed
restaurant profiles, dining zones/tables and a setup command ledger. Empty
branch scope selects organization setup; explicit branch scope retains legacy
setup. Removed implicit first-active-branch selection. OWNER authorization and
verified identity are checked before replay. No public creation or screen/gate
cutover yet; new table QR redemption and token retention remain unaccepted.

Current verification: Go tests for organization, restaurant, storefront, pos and
platform/database PASS; restaurant/database vet PASS. Web setup API/flow/pages
and workspace setup gate tests PASS (4 files, 92 tests), typecheck PASS,
contracts:check PASS (18 modules, 115 routes), scoped Prettier/gofmt and whitespace
checks PASS. Build PASS earlier in this slice with a large-chunk warning; not
browser evidence. No fresh browser acceptance.

Real PostgreSQL 17.6 tmpfs with official migrations 1-37: branchless setup PASS
(0.32s), explicit legacy onboarding PASS (0.19s) in the final full run. Includes
foreign/manager/unverified OWNER denial, concurrent replay, exact charges,
transaction rollback, tenant constraints and zero branch/terminal creation.
Empty migration down/reapply PASS; populated down refusal PASS in focused run.
Full suite remains FAIL on the four previously baseline-reproduced leaf cases.
The initial extra onboarding failure was an obsolete implicit-branch fixture;
it now supplies its explicit legacy branch and passes, without weakening its
replay, foreign-branch or metadata assertions. Logs:
.local/restaurant-branchless-setup-db.log and
.local/restaurant-branchless-setup-full.log. Task-owned DB/network cleanup verified.

Independent review of supplied setup source/evidence found no confirmed defect;
reviewer did not execute checks or inspect unrelated baseline failures. QR token
redemption/storage retention was outside established evidence. This is scoped
review only, not whole-flow approval. Remaining: organization storefront/menu/
orders/operational QR and kitchen, direct cash/online settlement, UI cutover and
full browser acceptance. Preserve historical records; no commit/push/deployment.

Organization menu checkpoint (2026-11-16, Asia/Bangkok; baseline a86d5d1):
the existing setup-menu API now accepts omitted branch scope. Migration 38 adds
organization/category and organization/product/variant registries plus menu_saved
and the menu command type. New menu writes create or reuse registered identities
only; legacy SKU/category/variant collisions are rejected, not silently adopted.
Legacy explicit-branch persistence is unchanged. Reads expose registered menu
items only; optional menu readiness and completion without menus are retained.
Future MENU_ONLY orders must consume the registry explicitly. Public creation, storefront and UI cutover stay
pending. Cross-workflow registry interaction remains unaccepted.

Current PASS checks:
- `go test ./... -count=1` in apps/api, DB/browser variables empty; scoped
  restaurant/storefront/database `go vet`. Package runs skip real DB acceptance.
- Focused PostgreSQL 17.6 tmpfs, runtime role, official migrations 1-38: PASS
  (1.76s; branchless creation/setup/menu 0.45s). Includes four concurrent menu
  requests, exact 45.25/55.35 prices, one replay audit, foreign/manager denials,
  registered update, legacy identity rejection, duplicate/SQL-constraint rollback,
  registry RLS/composite FK and zero branch/terminal commands.
  Empty down/reapply and populated down refusal PASS for migrations 37 and 38;
  ownership-checked task DB/network cleanup PASS. No primary migration.
- Focused web setup client/flow/pages/gate: 4 files, 93 tests PASS. Client preserves
  exact menu price without branch/source fields. Typecheck and build PASS; build
  reports the large-chunk warning. No fresh browser evidence.
- `npm run contracts:check` PASS (18 modules, 115 routes); scoped ESLint,
  Prettier, gofmt and `git diff --check` PASS; `npm run test:logs` 10/10 PASS.

Current FAIL checks, not release approval:
- Full isolated DB FAIL with four leaf cases: directory public projection
  `storefronts_check`, foreign invitation, pinned invitation and reconciliation
  authority revoked during GET. These names/errors match the earlier recorded
  baseline failures; no new baseline overlay was run in this menu slice. Branchless
  case PASS 0.50s and explicit legacy onboarding PASS 0.16s in the current full run.
- Root `npm run test` stops on web failures: 732 passed, 10 failed (90 files).
  Unchanged SettingsPage: storefront active-slug link. Unchanged ShopCartPage:
  checkout navigation/return. Unchanged StorefrontPage: exact quantity/cart badge,
  table QR persistence, four invalid-QR cases (invalid/empty/uppercase/duplicate),
  quote invalidation after quantity changes and uncertain-order replay. Their
  baseline status was not independently established; do not label them pre-existing.
- Separate `npm run test:dev-stack`: 6/7 PASS; development CSP/gateway-header
  comparison FAIL. Initial supervisor sandbox permission failure was retried via
  approved escalation and then PASS. No infrastructure/control changes made.

TDD: unit and real DB RED rejected omitted branch scope before implementation;
focused GREEN follows. An added SQL-constraint rollback test initially expected
ErrInput; corrected to established ErrConflict mapping for SQLSTATE 23514, without
altering production error semantics. Independent supplied-source review found
an OpenAPI dependency omission; `product_id` now requires `variant_id`, and category
matching is documented. Contract assertion RED/GREEN and delta re-review PASS.
No other confirmed scoped finding; reviewer did not run checks. Whole-flow,
browser and catalog interaction approval remain unmet.

Evidence: .local/restaurant-menu-red-console.log,
.local/restaurant-branchless-menu-db.log, .local/restaurant-branchless-menu-full.log,
.local/restaurant-menu-web-tests.log, .local/restaurant-menu-web-build.log and
.local/restaurant-menu-dev-stack.log. No commit, push, deployment or history deletion.

Organization storefront draft checkpoint (2026-11-16, Asia/Bangkok): migration
39 adds immutable LEGACY_POS/RESTAURANT source kinds. Restaurant drafts have no
terminal identity and a generated FK to their own restaurant profile.
Existing rows remain LEGACY_POS; no mode conversion or historical rewrite.
Verified OWNER settings writes use the existing organization lock, exact shipping
fees, revision checks and an atomic audit. Drafts cannot publish, accept orders or
call legacy product publication/catalog paths. UI and public creation remain
unchanged. This is an intermediate draft boundary, not the completed flow.

Current PASS: `go test ./... -count=1` in apps/api with DB/browser variables empty,
scoped storefront/restaurant/database vet, contracts:check (18 modules/115 routes),
scoped Prettier/gofmt and git diff --check. These Go package checks skip real DB
acceptance. No frontend production changes or fresh browser acceptance this slice.

Real PostgreSQL 17.6 tmpfs, runtime role, official migrations 1-39: final focused
PASS 1.82s, branchless creation/setup/menu/draft 0.52s. Covers four concurrent
initial saves (one success/three stale conflicts), exact 12.35/13.37 fees,
owner/manager/unverified/tenant/pinned boundaries, zero infrastructure, SQL/RLS/FK
guards, slug collision rollback with no draft/audit residue, no public visibility,
legacy no-conversion.
Empty down/reapply 37-39 and populated down refusal 37-39 PASS. Task-owned
container/network cleanup PASS. Evidence: .local/restaurant-branchless-settings-db.log.

Full isolated DB run FAIL 4.57s on the four previously recorded leaf cases:
directory storefronts_check, foreign invitation, pinned invitation and authority
revoked during reconciliation GET. Branchless PASS 0.47s, legacy no-conversion
PASS and explicit legacy onboarding PASS 0.15s. No new baseline overlay was run;
the final collision test was added after this full run and passed the focused
rerun. Evidence: .local/restaurant-branchless-settings-full.log. Cleanup PASS.
Earlier web/dev-stack failures above remain unresolved and were not rerun here.

TDD: draft input initially failed for required legacy infrastructure; contract
assertion initially failed for required terminal_id. Both pass after the change.
The first DB attempt failed because the new test expected organization.ErrNotFound
instead of the established storefront.ErrNotFound wrapper; corrected the test,
not production mapping. Attempt log retained. Independent supplied-source review
reports no confirmed P1/P2 finding in migration39/settings/catalog/contract scope;
reviewer used no tools and ran no checks. Whole-flow review remains pending.
No primary migration, commit, push, deployment or historical deletion.

# Menu page sizing (2026-11-15)

Scope: Small / Low, frontend layout only. Reuse standard list-page sizing on
/menu; preserve API calls, permissions and data. No database or external writes.







- [?] Full regression gate FAIL: npm run test reports 697/707 web tests passing.
      SettingsPage.test.tsx (1), ShopCartPage.test.tsx (1), StorefrontPage.test.tsx
      (8) fail outside this task's edited files. No baseline-pass claim or unrelated
      repairs. Downstream root checks did not run after Vitest failed.

Evidence: .local/menu-grid-red, .local/menu-layout-final,
.local/menu-layout-full-test.log and .local/menu-layout-build.log.

# Remove menu entry from restaurant setup (2026-11-15)

Scope: remove menu entry/validation/writes from /setup and allow server readiness
without menu items. Preserve existing catalog data, legacy menu endpoint, required
profile/services/tables/location/payments/orders, access checks and transactions.
Medium size / Medium risk; no migration, live database writes, push or deployment.
Recovery: revert only this task's source/test delta; no schema/data changes.







- [?] Full regression gate: `npm run test` failed with 697/707 web tests passing.
      Failures: SettingsPage.test.tsx (1), ShopCartPage.test.tsx (1), and
      StorefrontPage.test.tsx (8). These failures are outside this patch's edited
      behavior; no unrelated repairs or baseline-pass claims. Keep task open.
      Live database acceptance not run: no isolated disposable target established.

# Complete setup before workspace access (2026-11-13)

Scope: finish required configuration inside /setup and deny management pages
until the server reports completed setup. Large size / High risk (access gating).
Preserve server authorization, readiness and tenant/branch scope.
No migration, live database writes, external services, commit, push or deployment.
Recovery: revert only this task's source/test delta; no schema/data changes.







- [?] npm test: 695 PASS / 10 FAIL in SettingsPage, ShopCartPage and StorefrontPage.
  Failure names match .local/setup-correctness-full-test.log; unrelated fixes
  remain out of scope. Current evidence: .local/setup-access-root-test-final.log.
- [?] Independent access/configuration review requires explicit delegation authorization.
- [?] Live persistence acceptance requires an authorized isolated disposable target.
  All browser API writes were intercepted synthetic fixtures; no real database
  writes, external map/search requests, commit, push or deployment occurred.

# Setup flow correctness (2026-11-12)

Scope: frontend-only alignment of /setup with the existing four-screen flow and
current restaurant API. Medium size / Medium risk. Preserve API contracts,
authorization, scoped persistence, QR retries and existing saved settings.
No database writes, external map/search calls, commit, push or deployment.
Recovery: revert only this task's frontend/test delta; no data/schema changes.








- [?] Full npm test FAIL: 673 passed, 10 failed across SettingsPage.test.tsx,
  ShopCartPage.test.tsx and StorefrontPage.test.tsx. These failures are outside
  this setup patch; repairing those flows requires separately authorized scope.
  Do not claim the full suite passes or remove this section while unresolved.

Evidence: `.local/setup-correctness-red.json`, `.local/setup-recheck-red.json`,
`.local/setup-correctness-final.json`, `.local/setup-correctness-browser.json`,
`.local/setup-correctness-browser-retry.json`, `.local/setup-correctness-full-test.log`,
`.local/setup-correctness-build-final.log`, `.local/setup-correctness-typecheck-final.log`,
`.local/setup-correctness-lint-final.json`, `.local/setup-correctness-contracts.log`,
`.local/setup-correctness-log-tests.log` and `.local/setup-correctness-dev-stack-retry.log`.
The first readiness browser run had three selector failures: exact text included a
new adjacent management link. Corrected only that locator; all three reruns passed.
The task-owned Vite server was stopped after browser verification.

# PR #46 local merge (2026-11-12)

Scope: merge origin/feature/Dine-in (3d4019f) into develop (8eaed0b) locally.
Size: Large. Risk: High (checkout, table tokens and network exposure).
Preserve current checkout, tenant boundaries, translations, routes and loopback binding.
No push, service restart, database mutation or deployment.
Recovery: original develop commit 8eaed0b; preserve MERGE_HEAD until review.





- [?] Full web suite FAIL: 665 passed, 13 failed. Nine storefront/cart failures reproduced on pre-merge source; four organization/setup failures remain untriaged and outside merge scope.
- [?] Browser appearance and live database/payment acceptance have not run; no authorized isolated fixture target selected.
- [?] Independent scoped review requires explicit delegation authorization.
- [ ] Create local merge commit only after required acceptance passes.

Evidence: `.local/pr46-web-tests.json`, `.local/pr46-web-tests.log`,
`.local/pr46-baseline-storefront.json`, `.local/pr46-baseline-storefront.log`,
`.local/pr46-red.json`, `.local/pr46-lint.log`, `.local/pr46-build.log` and
`.local/pr46-dev-stack-retry.log`. Initial dev-stack harness failed on sandbox
temporary-directory permissions; the approved escalated retry passed.
Resolution keeps current settings, translations, /orders route, checkout safeguards
and Compose network bindings. Incoming PromptPay simulation and persistent or
fabricated table-token fallbacks are excluded; payment UI uses server payment status.
The incoming sample SQL file is not executed. Historical incoming TODO claims are
not fresh verification and do not establish current release readiness.

# Four-Step Restaurant Setup and Interactive Location (2026-11-11)

Approved flow: Store and services -> Store location -> Menu and payments -> Review and open.
Interactive map: pan, zoom, pin selection, explicit confirmation; no custom 3D model.
Remove branch-management presentation only; retain existing server scope.
Size: Large. Risk: High (location privacy, scoped persistence and QR retries).




- [/] Add validated location persistence code, additive schema 36 and synchronized API contracts; database acceptance pending.
- [/] Implement interactive map with immediate open, hidden raw coordinates, automatic location confirmation and GPS/error recovery; search is opt-in configuration only.


- [?] Independent review of privacy, persistence, gateway controls and QR retry changes requires scoped delegation authorization and an available compliant reviewer.
- [?] Persistence/isolation acceptance requires a confirmed, explicitly authorized task-owned disposable database.
- [ ] Remove this section after implementation, required checks and review pass.

Current evidence (2026-11-11): Chromium 156.0.8078.4 checked 320/768/1440px map behavior and responsive setup layouts using synthetic APIs/tiles with the production CSP injected. Final 320/1440px screenshots inspected; mobile stepper uses two columns without horizontal overflow. This is not live OSM, real Caddy or database acceptance. Scoped ESLint: zero errors, one react-refresh warning at OrganizationPages.tsx:301. The initial root ESLint invocation could not locate the workspace config; rerunning from apps/web passed with that warning. git diff --check passed. Evidence logs are task-local under .local/setup-*.log.

Recovery: additive schema only; runtime requires migration 36. Migration has NOT been executed. Preserve branch data and historic progress. No primary DB migration, paid subscription, commit, push or deployment is authorized. Keep per-payload idempotency keys and report partial saves; never rotate QR credentials on navigation. Optional VITE_LOCATION_SEARCH_URL has no default provider; cross-origin search needs a separately reviewed CSP allowance. Required independent review and isolated database acceptance remain unmet; do not mark release-ready or remove this section.

# Link Settings Page Header Button to Storefront Website (2026-11-10)

Scope: Update the storefront action button in SettingsPage header (`.settings-heading-actions`)
to link to the store's own online website (`/shop/:slug` if slug is available, falling back to `/shop`),
with `target="_blank" rel="noreferrer"` and appropriate "ดูหน้าร้าน" / "View storefront" text.
Preserve section 6 navigation to `/settings/storefront`.
Size: Small. Risk: Low.




- [ ] Terminal verification blocked: `titunnn_anti[1m]` safety classifier unavailable for shell/terminal commands
- [ ] Clean up completed task section from TODO.md upon full terminal verification

# Fix Mailpit UI access on http://localhost:8025/ (2026-11-10)

Scope: Enable host access to Mailpit Web UI at http://localhost:8025/ by updating docker-compose configuration.



- [ ] Recreate Mailpit service in Docker (`docker compose up -d mailpit`)
- [ ] Verify host connectivity to http://localhost:8025/

# Cart presentation refinement (2026-11-10)

Scope: cart item presentation and shared order-step connectors only. Small/Low.
Preserve existing uncommitted storefront work and quantity/order behavior.




- [?] Combined cart suites: 12/15 PASS; checkout-step copy assertion fails and
  QR/delivery submission tests raise "Rendered fewer hooks than expected".
  Scoped ESLint: conditional useEffect error plus missing quote dependency warning.
  Evidence: .local/cart-presentation-tests.log and .local/cart-controls-lint.log.
  Checkout logic repair is outside this presentation scope; do not claim all checks pass.

# PR #40 merge conflict resolution (2026-11-09)

Scope: integrate origin/develop b293708 into feature/add-auth 03a4e44 locally,
without commit or push. Preserve auth behavior and approved layout assertions.
Size: Medium. Risk: Medium. Main resolves the three conflicted tracker/E2E files;
incoming changes remain intact. No auth/security policy edits are authorized.




- [?] Full regression: web units 625/630 PASS (5 Auth failures, one missing
  ApiError mock error); mocked browser regression 224/245 PASS, plus setup 9/9.
  Browser failures include catalog list visibility and workspace route/assertion
  mismatches. Logs: .local/pr40-merge-unit.log and pr40-merge-regression.log.
  Do not claim release readiness or repair auth/access behavior in this scope.
- [ ] Merge commit and push require explicit authorization; PR remains unchanged.

# VELOPOS layout standards (2026-11-09)

Approved proposal, implementation, frontend specialist and independent review.
Size: Large. Risk: Medium (shared presentation/navigation). Preserve business
logic, API/auth/data boundaries, Warm Gold, fonts, logos and print dimensions.

Contract: content width = min(1232px, available width minus two gutters).
Management available width excludes sidebar. Gutters: 16px below 768px, 24px
otherwise. Breakpoints: 768/1024/1280px. Normal primary header: 66px including
border; allow text zoom to expand it. Major section separation: 80px. Standard
card padding and grid gap: 24px. Operational groups: 24px; fields: 16px;
labels/hints: 8px. Spacing base: 4px. Full-width backgrounds, no forced section
height, no blanket overflow hiding; wide tables scroll within bounded regions.

Superseded edge-alignment continuation: primary shell headers and page footers use their own
16/24px edge gutters, independent of the 1232px content cap. Management chrome
fills only the workspace beside the existing sidebar. Preserve desktop/sidebar
and mobile navigation behavior; do not add a catalog drawer. POS internal toolbar
and panel-local footers remain inside their existing operational containers.

Latest approved refinement: non-sidebar page families (landing, storefront,
account and setup) place header/footer contents halfway between the safe edge
gutter and the centered 1232px content edge. At 1920px the normal inset is 184px;
at 1440px it is 64px; compact screens retain 16/24px gutters. Management chrome
keeps its workspace edge alignment, including when its sidebar is collapsed.
Preserve directory assistant clearance without adding redundant wide-screen
padding. No business/auth changes, dependencies or external publication.
Size: Medium. Risk: Medium. Main owns the bounded CSS/token/test changes.
Dependencies: token rule before public consumers; rendered geometry before review.
Recovery: remove only this refinement's delta if requested; preserve earlier work.




- [?] Close only after the full web regression passes; Auth failures remain.

Latest midpoint evidence: mocked Chromium responsive regression 275/275 PASS,
plus 4/4 synthetic doubled-text header/footer checks at 1920px. RED geometry
showed four public failures and management PASS; GREEN passed all five.
Focused units 257/257 in 25 files PASS. Typecheck/build PASS; lint 0 errors and
9 warnings; explicit-path formatting and diff checks PASS. Current logs in
`.local`: `velopos-midpoint-red.log`, `velopos-midpoint-green.log`,
`velopos-midpoint-browser.log`, `velopos-midpoint-text.log`,
`velopos-midpoint-focused-unit.log`, `velopos-midpoint-typecheck.log`,
`velopos-midpoint-lint.log` and `velopos-midpoint-build.log`.

Full web units FAIL: 619/625 passed, 6 failures in 5 Auth files and one unhandled
missing ApiError mock (`.local/velopos-midpoint-unit.log`). Failures include
AccountFlow, AuthPages, GoogleAuth, RecoveryFlow and RegistrationVerification.
Do not attribute the additional failure to an earlier run or change Auth here.
No repository/release readiness claim. Preserve the other session's work.

Independent midpoint review: no confirmed actionable findings in supplied
source excerpts/delta and result summaries; reviewer ran no checks and did not
inspect the complete repository. Main inspected current desktop landing/catalog/
account/setup and mobile landing screenshots. Responsive tests cover 320 through
1920px, including breakpoint boundaries and management edge preservation.
Text enlargement is synthetic, not actual browser zoom. Real devices, Safari,
Firefox, actual safe areas and on-screen keyboard remain unverified. Mechanical
scan reports one rounded border warning in login.css, confirmed unchanged in
HEAD; no new visual-world or branding changes were authorized.




- [?] Full web regression fails in Auth tests; retain this section until PASS.

Ownership: Main owns shared tokens/styles, account/setup/management/POS shells,
layout regression tests and tracker. Frontend specialist owns landing,
storefront, directory and cart composition/styles, their browser tests and
language-switcher header styling. Reviewer gets only scoped source evidence,
diffs, contracts and checks; no shell, writes, network or sub-delegation.

- [?] Full web unit regression remains FAIL in concurrent Auth scope. Keep this
  section until the integration check passes; do not claim release readiness.

Historical edge-alignment evidence: mocked Chromium browser 265/265; scoped web unit tests
257/257 in 25 files; typecheck/build PASS; lint 0 errors/9 warnings. Logs:
`.local/velopos-shell-final-browser.log`, `velopos-shell-focused-unit.log`,
`velopos-shell-typecheck.log`, `velopos-shell-lint.log` and
`velopos-shell-build.log` (all in `.local`). Inspected current landing, management,
menu, directory, catalog and account screenshots at representative desktop/mobile
widths. Real Safari/Firefox/devices and on-screen keyboard not run.

Continuation reviewer found no confirmed actionable findings in the supplied
source excerpts/delta and reported checks, not the complete repository. Reviewer
did not execute tests or establish the cause of the Auth failures. Rendered footer
edge checks resolve the cascade concern; header height assertions pass. Main
updated the older landing header test to the approved uncapped shell contract,
retaining separate content-cap coverage. Scoped formatting and diff checks PASS.

Previous repository-wide web unit result: 620 passed/5 failed in 625 tests,
4 failed files and one unhandled missing ApiError mock in concurrent Auth work.
Preserve that session's source; do not claim repository/release readiness.
Evidence: `.local/velopos-shell-all-unit.log`. Auth failures are in AuthPages,
GoogleAuth, RecoveryFlow and RegistrationVerification; no Auth fixes in this scope.
Contract inventory 18 modules/115 routes, log tests 10/10 and dev-stack tests 6/6
PASS (`velopos-shell-contracts.log`, `velopos-shell-log-tests.log`,
`velopos-shell-dev-stack-retry.log` in `.local`). Initial dev-stack sandbox run
failed on temporary-directory permissions; the approved escalated rerun passed.

Historical initial layout evidence: browser 225/225. Account access at
641/700/767px failed before preserving the original 640px visibility cutoff and
passed after the CSS-only fix; full browser regression rerun passed. No auth or
navigation business logic changed. Contract inventory 18 modules/115 routes,
log tests 10/10, scoped formatting and diff checks PASS. Design detector retains
two existing easing advisories and one existing login border warning, confirmed
in HEAD; unchanged branding is intentional. Final global.css detector is clear.

Recovery: revert only task-owned reviewed delta when requested. No dependencies,
real transactions, DB changes, commits, pushes or deployment. Existing tracker
records the approved plan; no duplicate plan or handoff file.

# Password account flow completion (2026-11-09)

Approved flow: email/password registration, email-link verification, login routing
and password recovery. Work on feature/add-auth from ec42c32; preserve its UI and
Google behavior. Size: Medium. Risk: High (authentication).

Main owns bounded frontend/provider, Go delivery metadata, the login/reset
credential revalidation guard, contracts and tests.
No schema change, real email, database mutation, dependency install, commit,
push or deployment. Recovery: remove only this task's source delta; no stored
accounts, sessions or historical data are rewritten by development checks.




- [/] Reset error/generic response/local-session recovery checks pass. Existing
  transactional revocation and token expiry inspected; real DB proof is blocked.




- [?] Go race check requires CGO/toolchain support (current CGO_ENABLED=0;
  gcc/clang not found). No compiler installation or global setting change.



- [?] Real PostgreSQL and inbox acceptance need an authorized isolated target
  and test mailbox/provider. Verify expiry/reuse, rollback, user isolation,
  session revocation and both concurrent login/reset lock orderings there.
  User selected the existing isolated environment after committing the source
  as d725cea. Read-only discovery found Docker 29.9.2 outside PATH and retained
  volume `smartpos-auth-test_postgres-data`, but no containers or networks for
  that test project. The running `smartpos` project uses a different volume and
  must not receive acceptance fixtures. Await confirmation to restore the test
  services without migrations, resets or changes to retained data. No database
  test, service start or real mail send occurred during this discovery.

Acceptance: unverified accounts cannot enter setup/management through the UI;
existing server permissions remain authoritative; verification never logs in an
anonymous visitor; expired/reused links recover safely; no token/secret storage
or logging. SMTP acceptance is not proof of inbox delivery. Remove this section
only when implementation, required checks, independent review and acceptance pass.

# Account UI and Google authentication (2026-11-09)

Approved scope: shared login, register, verification, recovery and reset UI;
standard header, separate back-home link, smooth Warm Gold background;
Google sign-in/sign-up below the email form.

Size: Large. Risk: High. Main owns frontend/contracts/integration; backend owns
Go auth/config; database owns migration 34. Independent security review required.







- [?] PostgreSQL acceptance: no confirmed isolated disposable target; Docker,
  psql and postgres are unavailable locally. Migration/runtime-role grants,
  real rollback and concurrent consume/link tests remain unverified. Protect
  all primary/retained databases and volumes; do not run automatic cleanup.
- [?] Live Google acceptance needs OAuth credentials configured outside source
  code and an authorized test account. No Google resource or secret was changed.
- [?] Dependency vulnerability status is unknown; no scan ran. Go race detector
  did not run (CGO disabled; no C compiler available).

Acceptance: consistent routes; no email-based auto-merge; safe disabled/partial
config; no secret/token leaks; retain session, verification/reset and tenant guards.
Recovery: disable Google, retain password login and identity data; forward-fix
populated tables. No production changes, remote resources, deployment, push/commit.
Remove this section only after required verification and review pass.

# Swap shop directory heading and menu (2026-11-08)

Scope: Place the search heading before the shop-type menu; preserve search,
filters and view controls, with matching desktop/mobile grid columns.


- [ ] Update the toolbar-order regression and confirm RED.
- [ ] Swap heading/menu and corresponding grid columns.
- [ ] Run focused tests, web checks and proportional browser verification.
- [ ] Review the diff and remove only this task section after verification.

# Shared header proportions baseline (2026-11-08)

Scope: Reuse the approved setup header proportions across shared web layouts.
Keep routes, permissions, controls, page content and responsive navigation unchanged.
No API, database, dependencies, external services or deployment changes.





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



- [/] Run focused regression tests, web tests and typecheck; review the diff.
- [ ] Remove this section after verification passes.

# Warm Gold application-wide UI (2026-11-07)

Approved scope: Apply the supplied white/cream/gold reference across the web UI,
including shared tokens, backgrounds, navigation, headers, controls, operational
pages, storefront, landing and authentication. Preserve existing user changes,
business behavior, routes, permissions, local fonts and Lucide icons. No API,
database, external assets, new dependencies, publication or deployment changes.




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


- [?] Full-suite acceptance remains open on the recorded assertion/readiness
  failures; unrelated test/copy maintenance is not included in this UI change.
- [ ] Remove this task section only after required acceptance passes.

# Fix TS6133 unused Building2 import in OrganizationPages.tsx (2026-11-06)


- [ ] Verify typecheck and web build succeed
- [ ] Remove this temporary task section

# Standalone Restaurant Setup Redesign (/setup) without Sidebar Navigation (2026-11-08)

Approved scope: Redesign `/setup` page UI to match the user's standalone mockup reference (Image 2), completely decoupled from the sidebar menu / workspace navigation.
Includes moving `/setup` out of `RoleWorkspaceLayout` in `router.tsx`, 2-column layout with left hero panel (title "ตั้งค่าร้านอาหารของคุณ / เริ่มใช้งาน VELOPOS", subtitle, POS illustration, 3 value propositions: "ตั้งค่าร้านง่าย", "รองรับการสั่งซื้อหลายรูปแบบ", "ดูรายงานและยอดขาย"), and right step card (icon squircle, "ข้อมูลร้าน", exact form fields, placeholders, info notice callout, "ย้อนกลับ" and "ถัดไป →" buttons).
Preserve all functional logic, step validations, API contracts, and tests.







- [/] Run tests, typecheck, lint, and build verification
  PASS: focused setup Vitest (46 tests), `npm run typecheck`, `npm run build`, and `git diff --check`. `npm run lint` completed with 0 errors / 9 warnings in other files. No blanket IDE-diagnostics pass is claimed. Broader earlier acceptance remains separate.
- [ ] Complete broader visual acceptance; header layout checks at 320/768/1440px passed as recorded above
- [ ] Clean up completed task section from TODO.md upon full verification

# Onboarding simplification (2026-11-06)

- [/] Align organization creation and restaurant setup with the additive
  onboarding contract: generated organization code, default main branch,
  and preservation of identifiers, organization code and omitted branch.
  Legacy explicit inputs and strict organization/branch updates remain supported.
- [ ] Reconcile the OpenAPI request shapes with the final backend and frontend
      changes and run the contract inventory check.

- [ ] Rerun the required Go checks after the backend and integration changes.


- [?] Verify creation, retries, rollback and profile preservation against an
  isolated task-owned disposable database; Main reports this is blocked.
- [?] Aggregate `npm run test` FAIL: 4 failed / 475 passed in 62 web files;
  failures are NavigationMenu (1), SettingsPage (2), and
  StorefrontSettingsPage (1), outside this task. No baseline was run.
  The scoped QR export timing fix passes. Log:
  `.local/onboarding-simplification/test-final.log`.

- [ ] Complete independent code and security review for the transaction and
      idempotency changes, including the pending explicit-branch validation delta.

# Owner-only backoffice (2026-11-05)

- [/] Web regression repair (2026-11-16), authorized after baseline inspection:
  fix the ten reproduced web failures without changing order/payment logic,
  authorization, schema or primary data. Main owns the bounded frontend/test
  patch; no delegation, commit, push, migration or deployment is authorized.
  Restore the catalog add-result announcement; align tests with current routes
  and labels, await asynchronous storefront data and retain QR, quote freshness
  and idempotent-retry assertions. Verify RED/GREEN, full web tests, typecheck,
  contracts, lint, build and the actual diff. Browser checks require an isolated
  safe environment. Recovery reverts only this repair's local delta.
  Verification evidence (2026-11-16; current six-file local delta):
  - PASS RED/GREEN: the three affected web files changed from 40 passed / 10
    failed to 52 passed / 0 failed, including two added regression cases.
    Evidence: `.local/web-repair-red.json`, `.local/web-repair-focused.json`.
  - PASS final web rerun: 90 files, 756 tests. Evidence:
    `.local/web-repair-final-web.log`.
  - PASS final Chromium checks: Thai/English at 320px and 1440px, four tests.
    Covered successful/repeated keyboard additions and horizontal overflow. Static local build, synthetic intercepted APIs only;
    no database, live payment or screen-reader/audio acceptance is claimed.
    Evidence: `.local/web-repair-final-browser.log` and browser-results images.
  - PASS typecheck, contracts (18 modules / 115 routes), lint (0 errors / 12
    warnings), build (chunk-size warning), formatting and diff whitespace.
    Evidence: `.local/web-repair-typecheck.log`, `.local/web-repair-lint.log`,
    `.local/web-repair-build.log`, `.local/web-repair-full-recheck.log`.
  - FAIL root `npm run test`: web/contracts/log checks passed, but dev-stack
    returned 5 passed / 2 failed. The CSP assertion at
    `scripts/dev-stack.test.mjs:150` disagrees with dev websocket connect-src
    entries and remains unresolved outside this repair's authorized scope.
    The dev-watch failure was sandbox permission denial; its focused approved
    escalated rerun passed (1 test), not a passing full-root rerun.
    Evidence: `.local/web-repair-dev-watch-recheck.log`.
  - An earlier concurrent full run timed out in AccountFlow (755 passed / 1
    failed); its isolated rerun passed all three tests and subsequent full web
    runs passed. Timing contention is an inference, not a proven root cause.
    Original failed attempts are retained in `.local/web-repair-full-test.log`.
  - Main reviewed the actual frontend/test diff; QR denial, quote freshness and
    retry body/key assertions remain. No new independent review was dispatched;
    the previous role-removal review does not cover this accessibility repair.
    The bounded web regression is verified; overall acceptance stays open for
    the unresolved root CSP check. No commit, push or database changes made.

- [/] Role-definition removal follow-up (2026-11-16): support OWNER only in
  application catalogs, types and authorization branches. Preserve historical
  migrations, membership records and negative tests for retired/unknown roles.
  Use focused RED/GREEN Go/frontend tests, typecheck and contract checks; do not
  commit, push, migrate or access the primary database. Recovery reverses only
  this follow-up patch. The user authorized a separate read-only reviewer for
  this follow-up's diff, relevant contracts and check evidence only; no shell,
  network, writes, unrelated files or further delegation.
  Current baseline: `132edb10fb56c991ff9e38bddfd1a0d1cda34727`, explicitly
  accepted by the user on 2026-11-16. The role-removal implementation is in this
  commit; Main made no commit or application changes during this inspection.
  Implemented: OWNER-only Go catalog and frontend Role/labels; removed
  dead staff permission builders and named-role exceptions. Other runtime role strings fail the
  protected frontend access guard. Negative fixtures retain all retired roles
  and add UNKNOWN; narrowing the supported catalog does not remove policy tests.
  Current checks (2026-11-16):
  - PASS RED: Go catalog test failed on all five supported roles; frontend access
    tests failed seven cases (retired labels and unsupported runtime grants).
  - PASS GREEN: `go test ./... -count=1` from `apps/api`, 17 test packages.
    SMARTPOS_SINGLE_STORE_TEST_DSN was cleared and restaurant browser tests
    disabled for this command; this is not database integration evidence.
  - PASS `go vet ./...`, `go build ./...`; changed Go files are gofmt-clean.
  - PASS focused web tests: access, owner-access, WorkspacePages,
    OrganizationProvider, NavigationMenu, WorkspaceSetupGate (6 files, 94 tests).
  - PASS `npm run typecheck`, `npm run contracts:check` (18 modules, 115 routes),
    `npm run lint` (0 errors, 12 warnings) and `npm run build` (chunk-size warning).
    Typecheck initially failed on runtime-string role label indexing; explicit
    OWNER narrowing in ManagementLayout fixed those errors before the rerun.
  - FAIL full web suite: 744 passed, 10 failed in SettingsPage, ShopCartPage and
    StorefrontPage (3 of 90 files). Log: `.local/role-removal-web-tests.log`.
    The baseline comparison below reproduces these failures; none were repaired.
  - PASS fresh recheck (2026-11-16, 10:25): 94 focused web tests, Go tests
    (17 packages, database/browser opt-ins disabled), typecheck, contracts,
    Go vet/build and diff whitespace checks. All 31 application/test file
    hashes match the independent review evidence package.
  - PASS independent static review: the separate read-only reviewer inspected
    the complete 31-file application/test diff and requested supporting source
    inline, with no tools, and found no confirmed defects. The reviewer did not
    execute tests, verify hashes or inspect raw check output. This is not runtime
    acceptance or release-readiness approval. The reviewer is now closed.
  - PASS evidence reconciliation after baseline acceptance: all 31 file hashes
    still match `.local/role-removal-review.json`; database diff from `1d675621`
    to `132edb10` is empty. The worktree was clean before this tracker update.
  - FAIL fresh full web run on `132edb10`: 744 passed, 10 failed, 90 files.
    JSON: `.local/role-removal-current-results.json`. All 94 assertions in the
    six focused role/access suites passed in this run.
  - PASS failure attribution check, not suite acceptance: an isolated local
    snapshot of `1d675621` ran the same three failing files using the existing
    installed dependencies, without installation, checkout or database access.
    Result: 40 passed, 10 failed; all 50 assertion statuses and all 10 failing
    case names match the current run. Source, tests, test setup, Vite config and
    dependency manifests for this comparison are unchanged between the commits.
    Baseline JSON: `.local/role-removal-baseline-1d675621/apps/web/.local/role-removal-baseline-results.json`.
    These failures reproduce before the role-removal commit in this environment;
    no historical-environment or full-baseline-suite pass is claimed.
  - Remaining failure diagnosis: seven storefront cases query an older review
    button label, one cart case expects a different step label, one catalog case
    cannot find its named status announcement, and one settings case reads the
    fallback shop URL rather than the loaded slug. No assertions were weakened
    and no storefront/settings repair was included in this role-only inspection.
  - BLOCKED real database/tenant runtime acceptance: no confirmed disposable
    target. Browser acceptance also remains unverified. Main performed no
    migration, database write, commit, push or deployment during this inspection.

Approved scope: restrict backoffice access to active OWNER memberships; reject
all retired or unsupported roles. Remove the `/work`
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
  new work while preserving completed replay. Preserve historical data.
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
    defect. Prior approver issues were addressed; completed replay
    retains caller, tenant, key and reference checks, and new posting revalidates.
    This is not release-readiness approval. Required database integration is
    BLOCKED: Docker/PostgreSQL unavailable; query/source assertions do not prove
    SQL or replay semantics. Live acceptance must cover replay without duplicate
    effects, nonowner/foreign/inactive rejection, recovery, idempotency and status.
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
so the payment/refund/reconciliation checks in that transition branch were
skipped. No application fix or runtime reproduction was performed in that
skill/rules task; follow-up acceptance remains separate.

# Restaurant-only consolidation (2026-11-04)

Approved scope: execute the restaurant-only plan on feature/fix-flow-system.
Keep dine-in QR, pickup, delivery, payment-before-kitchen, sales/refunds,
forecasting and feedback. Remove unrelated retail interfaces and
retire unused backend entry points only after replacement/dependency checks.
Preserve historical records, existing task sections and authorization boundaries.
No commits, branch changes, provider requests, deployments or primary DB changes.



- [ ] Consolidate restaurant workspaces and remove unused retail screens.
  - Completed UI slice: restaurant task dashboard replaces fabricated metrics; retail navigation/routes and catalog brand/barcode/import/label tools removed.
  - Historical sales/return data remains visible without retired action links.
  - Retired URLs are tombstoned in bare/manage/work namespaces; positive tests preserve restaurant, sales/refund and public cart/tracking routes.
  - Partial: POS/shift/checkout remain until shared restaurant order/payment replacement passes; additional unmounted legacy source and live backend modules are not yet retired.
- [ ] Complete shared ordering/payment and paid-only kitchen acceptance.
  - Current continuation: public customer payment routes, paid-before-kitchen guards and the staff prepaid settlement action have been implemented. The isolated QR and pickup browser flows passed with a simulated provider; full acceptance remains open.
  - Wired CustomerPayments into transport.Options, cmd/server/main.go, and storefront.Service.
  - Kitchen queue (restaurant.Service.Queue) query strictly requires verified PAID payment attempt, and excludes active refund intents and fulfillment review reconciliations.
  - Transition in storefront/orders.go strictly enforces verified payment before orders can enter PREPARING or READY.
  - readOrder accurately reflects payment_status as paid when online payment attempt is PAID.
  - pos.SettlePrepaidOnlineOrder accounts for frozen shipping fees in total validation (cartTotal + shippingFee == expectedTotal).
  - Historical offline evidence: go test ./... -count=1 and go vet ./... passed; unit tests added in queue_test.go and online_orders_test.go. These checks alone do not establish full payment or kitchen acceptance.
- [?] Complete delivery flow needs a shipment service and a product decision on
  the shipment step. Migration 22 prohibits POS posting before shipment; do not
  bypass it. Real provider acceptance remains unverified.
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

# Online storefront settings (2026-11-06)

Approved scope: Add a dedicated "หน้าร้านออนไลน์" (Online Storefront Settings) page at `/settings/storefront` matching the VELOPOS UI design with a responsive 2-column layout, and add a navigation button from the main `/settings` page.
Includes Storefront Enable/Disable toggle, Details (store name, slug URL with .velopos.com suffix, description with char counter), Order Channels (Takeaway, Delivery, Dine-in), Storefront Appearance (6 theme colors, logo/cover upload), Online Order Hours (store hours vs custom online hours), and Store Link & QR Code display (copy URL and download QR code).
Preserve existing tests and contracts.





- [/] Run typecheck, lint, and full test suite verification (waiting for classifier to run terminal commands) 4. P1: Runtime CustomerPayments wiring gap identified -> implemented and verified in router.go, main.go, and storefront.Service. 5. P2: Order tracking payment status reporting identified -> implemented and verified in readOrder. 6. P2: Payment recovery edge cases identified.
- [ ] Remove only this task section after all acceptance gates pass.

Execution decisions:

- Use the current branch, already based on restaurant commit 440bafd; no merge or branch switch.
- Use this existing tracker instead of creating additional plan/ledger files.
- Do not drop historical tables or remove the payment engine while callers remain.

# Restaurant Ordering and Forecast Flow


- [ ] Define acceptance tests for dine-in QR, online delivery, queue, and backoffice flow
  - Current QR slice: reject invalid/inactive/cross-branch table tokens; bind quote/order to the same table; preserve idempotent replay and token privacy.
  - Verify table context survives catalog/cart navigation and appears in quote, order tracking, and paid-order queue.
  - Database acceptance requires a confirmed isolated target; do not apply migrations to the primary database.


- [ ] Verify stale revisions, branch scope and real SQL



- [ ] Implement shared restaurant order and queue behavior
- [ ] Implement bounded next-day menu forecast with manual approval
- [ ] Add focused frontend, API, database, and AI regression checks
- [ ] Run verification, review the diff, and remove this task section after acceptance
  - Historical QR continuation results (before HND-20261104-023817): go test ./... -count=1 and go vet ./... (apps/api); npm run test --workspace @smartpos/web (51 files, 340 tests); npm run contracts:check; npm run typecheck; npm run build; npm run test:logs (10 tests); npm run test:dev-stack (5 tests). Historical queue verification evidence remains in .local/queue-db-acceptance/.
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

# Account feedback with SweetAlert2 (2026-11-09)

Approved scope: shared text-only feedback and account-page presentation, including
email resend. Medium size/risk; no auth, permissions, quota, backend, database,
real mail, deployment or financial workflow changes. Preserve user edits.
Recovery: remove only task-owned source delta and the added dependency.

- [/] Add focused failing tests, then safe feedback and Retry-After presentation.
- [ ] Integrate account successes and actionable inline failures; retain validation.
- [ ] Run focused regressions, typecheck/lint/build and mocked browser checks.
- [ ] Review actual diff; remove this section only after verified acceptance.

# Setup field validation and structured Thai address (2026-11-15)

Scope: hide setup email/address without erasing values; inline name/Thai phone
validation; dependent Thai address fields, coordinate lookup and confirmation.
Large / High: coordinate privacy and persisted address validation.
User authorized free provider/data selection and coordinate-only lookup.
No paid services, deployment, push, live data or database migration.






- [?] Independent privacy/correctness review requires delegation authorization.

Recovery: retain legacy JSON and hidden contact values; manual entry works when
lookup fails. Remove this section only after required checks and review pass.


## Setup: remove map and move manual address (2026-11-15)

Supersedes the map UI in setup only; preserve optional legacy location data and the earlier privacy review blocker. Medium size / Medium risk.




- [?] Browser viewport and real database/API acceptance not run; no isolated target confirmed. Component/unit checks do not establish release readiness. Earlier independent privacy review remains blocked.
