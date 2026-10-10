# Operational workspace routing verification

Verified locally on **2026-10-11 (Asia/Bangkok)**. This is not production acceptance or deployment.

## Root cause and evidence

- Git branch was `develop`, two commits ahead of `origin/develop`; the initial working tree was clean. Other frontend/backend/Phase 5.5 edits appeared during this task and were preserved, not reverted or claimed as this task's implementation.
- `/` explicitly redirected to `/dashboard`, but `/dashboard` rendered the public Phase 0 `DashboardPage`. This was a retained foundation landing route, not the operational entrypoint.
- Before edits, both web containers served `index-DEEd-IaU.js`, SHA256 `85f4e13124139acf02d8fdc4a5cc0dd9ab298839a01e6242050b826381f1e512`, identical to a fresh local build. The reported landing problem was not an outdated Docker bundle.
- Anonymous browser reproduction at `http://localhost:8088/` reached `/dashboard`, heading `A smarter start.`, no organization selector, and `/api/v1/auth/me` returned 401. Operational navigation already existed but permission-filtered links correctly disappeared without real organization context.
- `safeReturnTo` accepted only `/account` and returned `/account` for every other value. Login therefore discarded product/POS/setup deep links rather than following the intended onboarding or operational flow.
- Caddy at port 8088 routes `/api/*` to Go and other paths to the static web service. Port 5173 is static-only: API paths fall back to SPA HTML, so it is not a working same-origin authentication entrypoint.
- OrganizationProvider already selects an accessible stored organization/branch, falls back to an available organization/branch, keys caches per user/tenant, and clears tenant preferences on logout. OrganizationGate already handles loading, errors, setup and permission-denied states. These tenant policies were preserved.
- Primary database inspection before verification showed migration 11, not dirty, and 48 FORCE-RLS tables. No primary database writes or migrations were performed by this task.

## Focused changes

- `apps/web/src/app/router.tsx`: protect `/dashboard` with RequireSession and OrganizationGate; protect `/setup` with RequireSession; retain the historical page at `/preview/foundation`.
- `apps/web/src/features/dashboard/{DashboardPage,FoundationPage}.tsx`: operational launcher using real organization context and backend-returned permissions; preserve the original foundation presentation separately. No invented sales metrics or mock transactions.
- `apps/web/src/features/auth/AuthPages.tsx` and `apps/web/src/app/ProtectedRoute.tsx`: preserve safe local deep links and query/hash; default login to `/dashboard`; reject external, malformed and recursive auth targets; authenticated `/login` returns to the application.
- `apps/web/src/app/routes.ts`, `layouts/ManagementLayout.tsx`, `styles/global.css`: separate operational navigation from previews, show actual context/breadcrumbs and make long navigation scrollable. Existing Golden Amber tokens and UI primitives remain.
- `apps/web/index.html`, HelpPage and SystemPage: remove obsolete claims that authentication and implemented modules are unavailable.
- Unit routing/returnTo regressions and `tests/e2e/workspace.spec.ts` added. Existing Foundation assertions now exercise `/preview/foundation`; account-focused auth tests explicitly request `/account` without removing assertions.
- README and architecture route documentation updated. The canonical contract remains **16 modules / 106 routes**, not 106 completed operational pages.

## Executed verification

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Test-first routing/returnTo regressions | Failed before fix, passed afterward | Initial router tests additionally exposed missing jsdom dialog methods; supported browser methods were stubbed in the test only. |
| `npm run typecheck` | Passed | Final working tree, including concurrent edits. |
| `npm run lint` | Passed | 0 errors; 3 existing Fast Refresh warnings. Initial control-regex lint error was corrected without weakening character validation. |
| `npm test` | Passed | Final run: 22 files / 133 tests; contract check retained 16 modules / 106 routes. Earlier focused task build had 21 files / 130 tests. |
| `npm run build` | Passed | Existing >500 kB bundle warning remains. |
| Focused Playwright workspace/auth/foundation/organization | Passed, 16/16 | Real cookies/API/registration/setup/invitations/branch RBAC/revocation/reset/rate limits and responsive layouts; `.local/workspace-playwright-report/index.html`. |
| Full Playwright regression | 22/27 passed on first run | `.local/workspace-full-playwright-report/index.html`; 5 failures were retained and investigated, not hidden. |
| Rerun of the 5 failed cases | Passed, 5/5 | `.local/workspace-retry-playwright-report/index.html`; organization, POS, both pricing tests and purchasing. |
| Primary gateway anonymous routing | Passed | `/`, `/dashboard`, `/setup`, product query deep link and `/pos` reached intended Login returnTo; no page errors; `.local/workspace-primary-login.png`. |
| Visual inspection | Passed for affected workspace | Actual screenshots at 320px and 1440px inspected; overflow assertions also cover 375/768/1920px. `.local/workspace-e2e/workspace-real-login-onboa-e8e90-nant-switching-and-returnTo/`. |
| `git diff --check` | Passed | No stage, commit, push, branch creation, reset or cleanup. |

The full run initially targeted `smartpos_phase53_phase54_2575e870_7e2a_4f35_9864_465d48f455d9`. During that run, another task restarted the isolated API and switched it to `smartpos_phase53_phase54_phase55_a2bea35c_35cd_4342_81a3_4c975fa36ce8`. Three cases failed test-client readiness; pricing SQL found no sale and purchasing SQL hit an organization foreign-key mismatch. The five-case rerun used the actual current isolated API database and all passed. This is evidence across runs, **not a claim of one uninterrupted 27/27 pass**.

Only local web services were rebuilt/recreated with `--no-deps`; API/Postgres/Caddy were not restarted by this task. Verified runtime bundle `index-Bp3Q_5u4.js` has SHA256 `c5e901ddf5edadaded4b52ac1632a0bce22ad59337a7ca7bed0632c43d1dd30f`, matching the focused local build byte-for-byte. At the final read, both gateways still served this fixed bundle and readiness returned 200. Concurrent later Phase 5.5 frontend edits produced a different local build; those unrelated additions were not rolled into the containers by this task. Existing browser tabs/cookies were not available through browser inventory, so the user's personal live account context was not inspected; real fresh Playwright sessions were used instead.

## URLs

- Main application: `http://localhost:8088/` or `http://localhost:8088/dashboard`.
- Login: `http://localhost:8088/login`; signup: `http://localhost:8088/register`; onboarding/organization selection: `http://localhost:8088/setup`.
- Implemented modules: `/pos`, `/products`, `/inventory`, `/sales`, `/receipts`, `/suppliers`, `/purchasing/orders`, `/shelves`, `/pos/returns`, `/pos/exchanges`, `/sales/voids`, `/sales/refunds`, `/pricing`, `/promotions`, `/discount-approvals`, `/customers`, `/settings/store`, `/settings/branches`, `/employees`, `/roles` under the same main origin, subject to permissions.
- Historical presentation: `http://localhost:8088/preview/foundation`.
- Isolated verification gateway: `http://localhost:18088/`, not the primary store database.

No primary transactions, persistent-volume deletion, RLS/RBAC relaxation, migration edits, production deployment, staging, commit or push were performed. Synthetic verification accounts/organizations remain in the isolated test database; existing data and concurrent changes remain intact.
