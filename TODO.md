# Complete setup before workspace access (2026-11-13)

Scope: finish required configuration inside /setup and deny management pages
until the server reports completed setup. Large size / High risk (access gating
and reuse of stock configuration). Preserve server authorization, readiness,
tenant/branch scope, exact quantities and existing ledger confirmation.
No migration, live database writes, external services, commit, push or deployment.
Recovery: revert only this task's source/test delta; no schema/data changes.

- [x] Trace and reproduce incomplete-setup direct-link access (RED/GREEN).
- [x] Add user/org/branch-scoped fail-closed workspace gate; retain unsaved work
      during background checks and revalidate cached completion before mounting.
- [x] Restore menu entry/save and inline stock source, opening stock and storefront
      configuration. Retain server-issued menu IDs on subsequent edits (RED/GREEN).
- [x] Focused regressions: 177/177 PASS across 10 files, including stock confirmation,
      exact quantity payload, save failure and scoped access/cache checks.
      Evidence: .local/setup-access-regressions-acceptance.json.
- [x] Mocked browser: 16/16 PASS; Chromium 156.0.8078.4 on Windows at
      320/768/1440px (viewport emulation, not real devices). Verify inline forms,
      keyboard focus/recheck, no overflow or nested forms, direct-link denial,
      failed/uncommitted completion and delayed successful completion.
      Evidence: .local/setup-access-browser-acceptance.json and matching screenshots.
- [x] npm run typecheck, npm run build, npm run contracts:check, scoped ESLint
      (0 errors, 1 Fast Refresh warning), scoped Prettier and git diff --check PASS.
      npm run test:logs: 10/10 PASS. npm run test:dev-stack: 7/7 PASS after approved
      rerun outside sandbox; initial run failed on temporary-directory permissions.
- [?] npm test: 695 PASS / 10 FAIL in SettingsPage, ShopCartPage and StorefrontPage.
  Failure names match .local/setup-correctness-full-test.log; unrelated fixes
  remain out of scope. Current evidence: .local/setup-access-root-test-final.log.
- [?] Independent access/configuration review requires explicit delegation authorization.
- [?] Live persistence/ledger acceptance requires an authorized isolated disposable target.
  All browser API writes were intercepted synthetic fixtures; no real database
  writes, external map/search requests, commit, push or deployment occurred.

# Setup flow correctness (2026-11-12)

Scope: frontend-only alignment of /setup with the existing four-screen flow and
current restaurant API. Medium size / Medium risk. Preserve API contracts,
authorization, scoped persistence, QR retries and existing saved settings.
No database writes, external map/search calls, commit, push or deployment.
Recovery: revert only this task's frontend/test delta; no data/schema changes.

- [x] Trace current UI, server readiness, supported business type and test seams.
- [x] Reproduce incorrect readiness and unsupported store types in focused tests.
- [x] Correct frontend readiness, store validation and location status feedback.
- [x] Focused setup/i18n regressions: 79/79 PASS, including RED/GREEN reproduction.
- [x] Browser: existing setup scenarios 10/10 and new readiness scenarios 3/3 PASS.
      Chromium 156.0.8078.4 on Windows; synthetic APIs only, external requests
      blocked. Readiness checked at 320/768/1440px, keyboard recheck and no overflow;
      320/1440px blocked-state screenshots inspected. No database/provider acceptance.
- [x] npm run build, npm run typecheck, npm run contracts:check and git diff --check PASS.
      Scoped ESLint: 0 errors, 1 react-refresh warning at OrganizationPages.tsx:301.
      Log tests 10/10 PASS. Dev-stack tests 7/7 PASS on approved escalated retry;
      initial sandbox run failed because Git Bash could not access its temporary path.
- [x] Main reviewed actual scoped diff; no API/auth/QR persistence changes.
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

- [x] Fetch both branches and identify eight conflicted files.
- [x] Resolve conflicts without importing payment simulation or fabricated table tokens.
- [x] Focused restaurant/QR/merge regression: 19/19 PASS; new safety regressions reproduced RED then GREEN.
- [x] Typecheck/build/contracts PASS; log tests 10/10 and dev-stack tests 7/7 PASS. Lint: 0 errors, 12 warnings.
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

- [x] Inspect setup steps, API DTOs, progress storage and current web dependencies.
- [x] Authorize external map/search queries and coordinates; no paid subscription.
- [x] Implement four screens, legacy-step resume mapping and recoverable sequential saves.
- [/] Add validated location persistence code, additive schema 36 and synchronized API contracts; database acceptance pending.
- [/] Implement interactive map with immediate open, hidden raw coordinates, automatic location confirmation and GPS/error recovery; search is opt-in configuration only.
- [x] Run focused web tests (64/64), browser tests (12/12), typecheck, build and contract inventory (18 modules, 115 routes).
- [x] Run scoped Go restaurant/database unit tests and gateway policy regressions (2/2); no database integration implied.
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

- [x] 1. Update `SettingsPage.test.tsx` with regression tests for the storefront website link
- [x] 2. Update `SettingsPage.tsx` to link header button to `/shop/:slug` (or `/shop`)
- [x] 3. Update translations in `apps/web/src/i18n/organization.ts` for `settingsStorefront`
- [ ] 4. Terminal verification blocked: `titunnn_anti[1m]` safety classifier unavailable for shell/terminal commands
- [ ] 5. Clean up completed task section from TODO.md upon full terminal verification

# Fix Mailpit UI access on http://localhost:8025/ (2026-11-10)

Scope: Enable host access to Mailpit Web UI at http://localhost:8025/ by updating docker-compose configuration.

- [x] 1. Root Cause Investigation: Verify why Mailpit container does not publish port 8025 to the host
- [x] 2. Update docker-compose.yml to expose Mailpit port 8025 to host (uncomment # internal: true on intelligence)
- [ ] 3. Recreate Mailpit service in Docker (`docker compose up -d mailpit`)
- [ ] 4. Verify host connectivity to http://localhost:8025/

# Cart presentation refinement (2026-11-10)

Scope: cart item presentation and shared order-step connectors only. Small/Low.
Preserve existing uncommitted storefront work and quantity/order behavior.

- [x] Hide placeholder variants; center quantity icons; align controls beside details.
      Below 480px, retain readable details and wrap actions into a compact lower row.
- [x] Make removal explicit; connect order steps without crossing labels.
- [x] New component checks 2/2 and cart-state checks 5/5 PASS. Typecheck/build PASS.
      Chromium 156.0.8078.4 on Windows, mocked API only: browser checks 4/4 PASS
      at 320/375/768/1440px; inspected screenshots at 320 and 1440px. No DB writes.
      Evidence: .local/cart-controls-unit.log, cart-controls-cart-unit.log,
      cart-controls-browser.log, cart-controls-typecheck.log and cart-controls-build.log.
- [?] Combined cart suites: 12/15 PASS; checkout-step copy assertion fails and
  QR/delivery submission tests raise "Rendered fewer hooks than expected".
  Scoped ESLint: conditional useEffect error plus missing quote dependency warning.
  Evidence: .local/cart-presentation-tests.log and .local/cart-controls-lint.log.
  Checkout logic repair is outside this presentation scope; do not claim all checks pass.
- [x] Main reviewed presentation delta; no API/auth/payment behavior edits intended.
      Leave task section open until the failing regression/lint checks are resolved.

# PR #40 merge conflict resolution (2026-11-09)

Scope: integrate origin/develop b293708 into feature/add-auth 03a4e44 locally,
without commit or push. Preserve auth behavior and approved layout assertions.
Size: Medium. Risk: Medium. Main resolves the three conflicted tracker/E2E files;
incoming changes remain intact. No auth/security policy edits are authorized.

- [x] Resolve conflicts while retaining both task lists and current layout tests.
- [x] Verify no conflict markers or unmerged entries; focused units 171/171 PASS,
      typecheck/build PASS, lint 0 errors/9 warnings, formatting/diff checks PASS.
- [x] Review merge delta: conflict resolutions retain HEAD's layout tests;
      incoming shop-directory changes only reformat the superseded test block.
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

- [x] Establish failing midpoint geometry tests, retaining management edge coverage.
- [x] Apply public/account/setup midpoint insets without changing content widths.
- [x] Run scoped browser/static/unit checks and independent package review.
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

- [x] Separate shell chrome from content, with failing geometry regressions first.
- [x] Verify updated geometry and responsive interactions in mocked Chromium.
- [x] Independently review the supplied continuation source and check evidence.
- [?] Full web regression fails in Auth tests; retain this section until PASS.

Ownership: Main owns shared tokens/styles, account/setup/management/POS shells,
layout regression tests and tracker. Frontend specialist owns landing,
storefront, directory and cart composition/styles, their browser tests and
language-switcher header styling. Reviewer gets only scoped source evidence,
diffs, contracts and checks; no shell, writes, network or sub-delegation.

- [x] Establish failing rendered layout tests before presentation changes.
- [x] Shared spacing/container/header contract and rendered geometry checks.
- [x] Public page families and navigation (specialist; consumes shared tokens).
- [x] Account/setup, management and POS; preserve routes and interactions.
- [x] Remove only superseded layout declarations, retaining print geometry.
- [x] Focused safe local checks and synthetic browser regressions at
      320/390/767/768/1023/1024/1279/1280/1440/1920px and short heights.
- [x] Check alignment, header/card/section spacing, keyboard/focus, Thai/English,
      table-local scrolling, no page overflow and loading/empty/error states.
- [x] Independent scoped source review; resolved landing gap and account-menu
      cutoff regressions. Reviewer inspected supplied source/log excerpts, not the
      complete diff or logs, and did not execute tests. Main reviewed the scoped diff.
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

- [x] Reproduce unverified login routing and missing delivery/recovery feedback.
- [x] Complete verification routing, explicit success, resend cooldown, signup
      recovery link and session error recovery. Preserve Google flow and UI.
- [x] Expose registration SMTP acceptance without undoing a committed account;
      update Go callers, client and public schema together.
- [/] Reset error/generic response/local-session recovery checks pass. Existing
  transactional revocation and token expiry inspected; real DB proof is blocked.
- [x] Fresh local checks (2026-11-09): focused auth 49/49; full `npm run test`
      PASS (web 618/618 in 75 files, contracts 18 modules/115 routes, log tests 10/10,
      dev-stack tests 6/6). Typecheck, web build and lint PASS (0 errors/9 warnings).
- [x] `go -C apps/api test ./...`, `go -C apps/api vet ./...` and
      `go -C apps/api build ./...` PASS with dependency downloads disabled and
      integration DSN/browser flags unset. PostgreSQL protocol stub is not a real DB.
      Initial full Go compile found two remaining RegistrationResult/Profile fixture
      callers; both corrected before the passing run.
- [x] Local mocked Chromium checks 39/39: 16 password-flow cases at 390/1440px
      plus 23 existing auth/Google/layout regressions at 320/700/701/1440px.
      APIs intercepted; dev proxy pointed to an unused local port, no real service
      writes. Covers keyboard/focus, token URL removal, anonymous and wrong-account
      verification, explicit Continue, resend, expired links and recovery errors.
      Four synthetic mobile/desktop screenshots inspected. Vite task process stopped.
- [x] Scoped Prettier, gofmt and `git diff --check` PASS. Logs:
      `.local/password-account-all-tests-final.log`, `password-account-web.log`,
      `password-account-browser-final.log`, `password-account-go.log`,
      `password-account-vet.log`, `password-account-go-build.log`,
      `password-account-typecheck.log`, `password-account-lint.log`,
      `password-account-build.log`, `password-account-format.log` (all in `.local`).
      First dev-stack/vet attempts hit sandbox cache/temp permissions; native
      escalated reruns passed. Original failure logs retained.
- [?] Go race check requires CGO/toolchain support (current CGO_ENABLED=0;
  gcc/clang not found). No compiler installation or global setting change.
- [x] Authorized independent read-only security review covered the scoped
      password-flow source/contracts and reset boundary. It found an existing
      login/reset race, confirmed against HEAD and current source. Login now
      revalidates the active user's password hash under a transaction row lock
      before inserting a session. Final source-delta review PASS; no additional
      actionable defect identified. This is not database or release acceptance.
- [x] Login/reset orchestration regression: RED before the guard; GREEN after
      it, covering unchanged and replaced credentials without exposing tokens.
      The net.Pipe PostgreSQL protocol stub does not validate SQL lock semantics.
      Fresh post-fix `go -C apps/api test ./... -count=1`, vet and build PASS;
      gofmt and `git diff --check` PASS. Initial sandbox cache-access failures
      remain in separate logs; the native approved reruns passed.
- [x] Review-time web checks rerun: 12 files/49 tests PASS; contract inventory
      PASS (18 modules/115 routes). Frontend source stayed unchanged during the
      backend fix. Logs: `.local/password-account-review-web-current.log`,
      `.local/password-account-review-contracts-current.log`,
      `.local/password-account-login-reset-red.log`,
      `.local/password-account-login-reset-green.log`,
      `.local/password-account-login-reset-go-all-approved.log`,
      `.local/password-account-login-reset-vet-approved.log` and
      `.local/password-account-login-reset-build-approved.log`.
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

- [x] Add failing UI tests, implement shared shell, preserve existing auth flows.
- [x] Implement Google code flow, state/PKCE/nonce, replay/expiry protection,
      password-confirmed linking and no organization grants on signup.
- [x] Integrate additive migration, schema version and optional safe config.
- [x] Integrate capability/error/linking UI, translations and API contracts.
- [x] Local checks on 2026-11-09: web tests 606/606 (72 files), focused account
      checks 46/46, mocked Chromium browser checks 30/30, Go tests all packages and
      go vet PASS. Typecheck, build, contracts and scoped formatting PASS; lint has
      0 errors / 9 warnings. Log tests 10/10 and dev-stack tests 6/6 PASS.
- [x] Independent read-only source review: no actionable security/correctness
      defects verified in the supplied scoped source and evidence package. This
      is not live provider, database, dependency-scan or release acceptance.
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

- [x] Inspect instructions, existing changes, toolbar styles and tests.
- [ ] Update the toolbar-order regression and confirm RED.
- [ ] Swap heading/menu and corresponding grid columns.
- [ ] Run focused tests, web checks and proportional browser verification.
- [ ] Review the diff and remove only this task section after verification.

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

# Dine-in QR Ordering & Kitchen Queue Management (2026-11-07)

Approved scope: Implement complete Dine-in QR Ordering Flow and Kitchen Queue Board according to approved architecture plan (Phases 1-5).
Features: Table QR detection, mobile food catalog with category tabs & quick counter, order review, PromptPay QR payment simulation and status polling, order confirmation screen, 4-step live order tracking timeline, queue board TV display (preparing vs ready columns, audio chime, Thai date and digital clock), and table QR stand tent card generator.

- [x] Phase 1: Customer Dine-in Flow (Table detection, food menu catalog UI, order review)
  - Verified: Table QR token persistence across sessions, dynamic category pills ('ทั้งหมด', categories with badge counts), +/- quick counters on menu cards, in-cart badges, floating bottom cart bar (e.g., '1 รายการ | รวม ฿60.00 | ดูตะกร้า ➔'), Dine-in cart review with table code badge.
- [x] Phase 2: In-App PromptPay QR Payment (Dynamic PromptPay QR, payment simulation & status polling)
  - Verified: Dynamic EMVCo PromptPay QR generation (generatePromptPayPayload, CRC16 ISO/IEC 13239 verified with unit tests in promptpay.test.ts), pure SVG QR renderer in qr-code.tsx with unit tests in qr-code.test.tsx, payment amount & table badge, simulate payment success button ('จำลองการชำระเงินสำเร็จ (Test Pay)'), and alternative pay-at-counter button.
- [x] Phase 3: Order Confirmation & Live Tracking (Order confirmation screen with #queue/table/amount, 4-step live tracking timeline)
  - Verified: Order confirmation card (green checkmark, order number, table code, amount, 'ติดตามสถานะ ➔'), and 4-step reactive order tracking timeline in OrderDetails.tsx (1. ชำระเงินสำเร็จ ➔ 2. กำลังเตรียมอาหาร ➔ 3. พร้อมเสิร์ฟ ➔ 4. เสิร์ฟแล้ว).
- [x] Phase 4: Queue Board TV Display (Dual column layout 'กำลังเตรียมอาหาร' vs 'พร้อมรับอาหาร', audio chime, Thai date & clock)
  - Verified: Dual-column responsive queue board in QueueBoard.tsx with cooking pot / shopping bag icons, badge counters, Web Audio API chime on new ready queue, live Thai date & digital clock ticker, fullscreen toggle, and route integration in /restaurant/queue.
- [x] Sample Restaurant Menu Seeding (26 items across 6 categories, SVGs, tables A01-A03, verified on Storefront API)
  - Added 24 high quality vector SVG images in apps/web/public/images/products/.
  - Created reproducible SQL seed script in database/seed-sample-restaurant-menu.sql.
  - Seeded 26 food/drink items (single dishes, noodles, soups, snacks, drinks, desserts) with units (จาน, ชาม, แก้ว, ถ้วย, ที่), active stock balances, quality stock balances, and published storefront entries.
  - Configured dining tables (A01, A02, A03) with SHA-256 token hashes for seamless QR ordering.
  - Verified live endpoint /api/v1/storefronts/velo-cafe/products returns 26 total items across 6 categories.

- [x] Phase 5: POS & Kitchen Workspace Integration (Table QR code generator / printable tent cards, kitchen/POS status transitions)
  - Verified: Printable Table Tent Stand card modal in StockAndTables.tsx with VELO branding, table code, SVG QR code, and print action (window.print()).
  - QR Scanner & Network Fixes Verified:
    - Standard ISO/IEC 18004 pure TypeScript QR code matrix generator in qr-code.tsx (Nayuki algorithm: byte mode UTF-8, proper Reed-Solomon polynomial division, functional module placement, dark module preservation at (size-8, 8), dual format info copies with correct bit-order, version info for V >= 7, and 8-mask penalty evaluation). Verified scannable by camera/Google Lens/iOS.
    - Table QR host switcher (Localhost vs Wi-Fi LAN IP 192.168.200.31:8088 vs custom domain) with 'คัดลอกลิงก์' (Copy Link) and direct 'เปิดสั่งอาหาร (เครื่องนี้)'.
    - Persistent deterministic fallback table token resolution so 'ดู / พิมพ์ QR' button is always shown for every table even after page reload.
    - Full quality checks pass: 58/58 test suites (424/424 tests), typecheck clean, lint clean (0 errors), build clean.

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
- [/] 5. Run typecheck, lint, and full test suite verification (waiting for classifier to run terminal commands) 4. P1: Runtime CustomerPayments wiring gap identified -> implemented and verified in router.go, main.go, and storefront.Service. 5. P2: Order tracking payment status reporting identified -> implemented and verified in readOrder. 6. P2: Payment recovery edge cases identified.
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

# Account feedback with SweetAlert2 (2026-11-09)

Approved scope: shared text-only feedback and account-page presentation, including
email resend. Medium size/risk; no auth, permissions, quota, backend, database,
real mail, deployment or financial workflow changes. Preserve user edits.
Recovery: remove only task-owned source delta and the added dependency.

- [/] Add focused failing tests, then safe feedback and Retry-After presentation.
- [ ] Integrate account successes and actionable inline failures; retain validation.
- [ ] Run focused regressions, typecheck/lint/build and mocked browser checks.
- [ ] Review actual diff; remove this section only after verified acceptance.

# Task: Fix E2E Test Failures in CI (workspace-areas.spec.ts)

## Objective

- Diagnose and fix the failing E2E tests in ests/e2e/workspace-areas.spec.ts shown in GitHub Actions CI run (customer layout isolation and restaurant-only dashboard).

## Scope & Affected Components

- ests/e2e/workspace-areas.spec.ts
- Relevant frontend layouts/components/translations if applicable (StorefrontLayout.tsx, ShopCatalog.tsx, ManagementLayout.tsx, DashboardPage.tsx)

## Implementation Checklist

- [x] Phase 1: Reproduce failures locally
  - [x] Launch web server on port 8088 and run playwright test tests/e2e/workspace-areas.spec.ts
  - [x] Capture the exact failure messages and causes
- [x] Phase 2: Analyze root cause and formulate fix
  - [x] Investigate why customer layout isolation failed at 320px, 768px, 1440px
  - [x] Investigate why restaurant-only dashboard failed at 320px, 768px, 1440px
- [x] Phase 3: Implement fix
  - [x] Apply necessary fixes to test assertions or application code
- [x] Phase 4: Verification & Testing
  - [x] Run playwright test tests/e2e/workspace-areas.spec.ts and verify all tests pass
  - [x] Run web unit tests, lint, and typecheck
  - [x] Verify no regressions

## Risks & Architecture Notes

- Maintain bilingual (Thai/English) compatibility if test assertions or UI text are sensitive to language.
- Ensure viewport responsiveness across 320px, 768px, and 1440px.
