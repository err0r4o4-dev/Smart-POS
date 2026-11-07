# First-time Restaurant Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure first-time restaurant onboarding flow matching the supplied VELOPOS six-step setup wizard and route completed owners into the dashboard.

**Architecture:** Keep the existing React/Vite frontend, Go modular monolith, PostgreSQL and OpenAPI inventory. Add an additive setup aggregate with server-authoritative progress, tenant-scoped settings, idempotent step completion, and immutable order-price snapshots. Keep `/setup` as the entry route and preserve existing workspace, storefront, POS, and historical data boundaries.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Lucide, Vite, Go `chi`/`net/http`, PostgreSQL/pgx, OpenAPI, existing Vitest and Go test suites.

**Spec:** User-provided VELOPOS first-time setup reference and approved conversation plan.

## Global Constraints

- Use branch `feature/fix-frist-job`.
- Preserve existing uncommitted work; do not modify `apps/web/src/features/workspace/WorkspacePages.tsx` or `WorkspacePages.test.tsx` unless explicitly required later.
- Preserve `data`/`error` response envelopes, owner and organization/branch authorization, RLS context, idempotency, exact money/quantity semantics, audit history, and paid-before-kitchen predicates.
- Additive database migrations only after migration `000029`; do not alter existing historical migrations.
- Use Thai/Latin localization, existing yellow/navy/green tokens, Lucide icons, responsive controls, visible focus, semantic labels, and honest loading/error/retry states.
- Do not store logo bytes or payment secrets in the database; use an approved server-side storage boundary and configuration values.
- Card payment remains disabled until a real integration exists; the UI must not claim it is active.
- Dine-in and takeaway default enabled, delivery default disabled, auto-confirm default disabled, trial default 30 days, VAT and service charge default 0. The charge basis for nonzero rates requires a product decision before enablement.

## Status and recovery note: 2026-11-06

**PARTIAL:** Full onboarding remains approved and in scope. Task 6 and downstream enforcement are incomplete; the checks below do not establish final acceptance.

- The independent architect reports missing tax and service-charge pricing, SQL and refund reconciliation, immutable financial snapshots, modifiers, downstream enforcement of setup service/payment/auto-confirm flags, and logo storage. Decide whether VAT applies to discounted merchandise alone or also to service, and decide shipping treatment, before enabling nonzero rates.
- Identity work includes queueing before account lookup, dedicated quota scopes in migration `000031`, truthful reporting of a created profile when registration SMTP delivery fails, and user-before-token locking. `database.RequiredVersion` is `31`. Migrations `000030` and `000031` remain unexecuted.
- Evidence reported by Main, current at the time of each run: identity/database Go tests and vet passed; contract inventory passed with 18 modules and 117 routes. A frontend agent reported 29 component tests and 456 web tests passed, plus three mocked-API browser viewport tests at 320, 768, and 1440px. The browser tests cover only the first screen, not the full journey. These results predate final integration; frontend QR DTO and backend readiness work remain in progress.
- Database acceptance is BLOCKED: no Docker or PostgreSQL executables and no verified disposable target. Do not install tooling or act on retained databases. Run migrations and acceptance only on a confirmed isolated, task-owned disposable target.
- Independent Sagan/Volta source re-review is pending. Checked test and validation entries below record historical runs. Repeat affected checks and obtain final independent review after integration; retain the earlier evidence as historical or current-at-run only.
- Ownership and recovery: preserve overlapping user work, including the concurrent Settings task and `TODO.md`. Do not commit or push. Resume with the pending charge-basis decision, incomplete implementation, disposable database acceptance, full browser journey, and final review.

## Review Focus

- Unverified users cannot create or resume organization setup, and verification tokens are single-use, expiring, and non-enumerable.
- Setup mutations reject foreign, inactive, or non-owner organization/branch access and do not leak tenant data.
- Retried step completion and organization creation do not duplicate organizations, zones, tables, menus, payment settings, or audit effects.
- Menu modifiers, tax, service charge, and payment state are snapshotted into orders without changing historical totals.
- Wizard state remains truthful on missing backend capability, validation failure, reload, mobile layout, keyboard navigation, and screen-reader use.

---

### Task 1: Add setup and verification schema

**Files:**
- Create: `database/migrations/000030_first_time_restaurant_setup.up.sql`
- Create: `database/migrations/000030_first_time_restaurant_setup.down.sql`
- Modify: `apps/api/internal/platform/database/database.go`
- Test: `apps/api/internal/platform/database/setup_migration_test.go`

**Interfaces:**
- Produces tables and constraints for email verification tokens, setup state, restaurant setup settings, service modes, zones, table-zone links, payment settings, tax/service-charge settings, and trial state.
- Keeps all organization/branch foreign keys, uniqueness, status checks, and RLS policies tenant-scoped.

- [x] Write static migration tests for required tables, single-use expiry fields, tenant keys, unique zone/table constraints, and forbidden plaintext secret storage.
- [x] Add the additive migration with reversible down statements and no data rewrite.
- [x] Update `database.RequiredVersion`; the current value is `31` after the quota migration.
- [x] Run `go test ./internal/platform/database -count=1` from `apps/api`.

### Task 2: Implement email verification

**Files:**
- Modify: `apps/api/internal/modules/identity/service.go`
- Modify: `apps/api/internal/modules/identity/http.go`
- Modify: `apps/api/internal/modules/identity/mailer.go`
- Modify: `apps/api/internal/modules/identity/domain.go`
- Test: `apps/api/internal/modules/identity/*verification*_test.go`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/routes.json`

**Interfaces:**
- Add `POST /api/v1/auth/email/verify` and `POST /api/v1/auth/email/resend`.
- Verification response returns the established envelope and refreshed auth/onboarding state.
- Resend is rate-limited and never confirms whether an email exists.

- [ ] Add failing service and HTTP tests for valid, expired, reused, malformed, unknown, and throttled tokens.
- [x] Implement token hashing, expiry, single-use transaction, audit event, and mailer dispatch through existing seams.
- [x] Block setup mutations for unverified users while preserving login and safe account recovery behavior.
- [x] Update OpenAPI and route inventory.
- [x] Run focused identity tests and `npm run contracts:check`.

### Task 3: Add setup aggregate and restaurant settings API

**Files:**
- Create/modify: `apps/api/internal/modules/restaurant/setup.go`
- Modify: `apps/api/internal/modules/restaurant/http.go`
- Modify: `apps/api/internal/modules/restaurant/service.go`
- Modify: `apps/api/internal/modules/organization/service.go`
- Modify: `apps/api/internal/transport/router.go`
- Test: `apps/api/internal/modules/restaurant/*setup*_test.go`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/routes.json`

**Interfaces:**
- `GET /api/v1/organizations/{id}/restaurant/setup` returns saved six-step state and readiness reasons.
- `PUT /api/v1/organizations/{id}/restaurant/setup/profile` saves restaurant profile.
- `PUT /api/v1/organizations/{id}/restaurant/setup/services` saves dine-in, takeaway, and delivery modes.
- `PUT /api/v1/organizations/{id}/restaurant/setup/tables` saves zones, tables, and QR generation settings.
- `PUT /api/v1/organizations/{id}/restaurant/setup/menu` saves category/menu seed entries.
- `PUT /api/v1/organizations/{id}/restaurant/setup/payments` saves enabled merchant payment methods without card activation.
- `PUT /api/v1/organizations/{id}/restaurant/setup/orders` saves QR/kitchen/auto-confirm/VAT/service-charge settings.
- `POST /api/v1/organizations/{id}/restaurant/setup/complete` validates all prerequisites, starts the 30-day trial, writes audit state, and returns dashboard readiness.

- [ ] Add failing tests for progress, readiness, invalid step payloads, owner-only authorization, branch mismatch, idempotency, and retry behavior.
- [x] Implement one transaction per step with server-side validation and setup-state advancement only after all writes succeed.
- [ ] Reuse existing organization/restaurant authorization and response helpers.
- [ ] Ensure complete rejects missing menu/payment/order prerequisites and never fabricates success.
- [x] Update OpenAPI, route inventory, and router wiring.
- [x] Run focused restaurant/organization tests and contract checks.

### Task 4: Add frontend API adapter and six-step wizard

**Files:**
- Modify: `apps/web/src/features/organization/OrganizationPages.tsx`
- Create: `apps/web/src/features/organization/setup-api.ts`
- Create: `apps/web/src/features/organization/setup.css`
- Modify: `apps/web/src/features/organization/OrganizationPages.test.tsx`
- Modify: `apps/web/src/app/AuthProvider*` only if onboarding state requires it

**Interfaces:**
- `SetupWizard` renders six real steps and consumes typed setup/readiness responses.
- Each step has `back`, `next`, retry, field validation, and persisted server progress.
- Unsupported capabilities show unavailable/disabled state, never fake completion.

- [x] Add component tests for six-step navigation, validation, loading/error/retry, reload resume, keyboard focus, mobile single-column layout, and truthful unavailable card payment.
- [x] Implement typed API adapter using the existing fetch/error/query conventions.
- [x] Replace the old three-part setup form with the six-step surface while preserving organization creation compatibility.
- [x] Implement supplied visual direction: left progress rail, 2x3 overview cards, white/yellow/navy/green tokens, responsive mobile layout, Thai labels, Lucide icons.
- [x] Run focused organization tests, typecheck, and lint.

### Task 5: Add readiness review and dashboard transition

**Files:**
- Modify: `apps/web/src/features/organization/OrganizationPages.tsx`
- Modify: `apps/web/src/features/organization/setup-api.ts`
- Modify: `apps/web/src/features/workspace/WorkspaceRouting.tsx` or the owning guard only if required
- Test: `apps/web/src/features/organization/OrganizationPages.test.tsx`

**Interfaces:**
- Review screen shows exact incomplete prerequisites.
- Complete setup calls the server completion endpoint once, handles conflict/retry, then routes to the existing dashboard.
- Existing organizations bypass setup without changing workspace navigation behavior.

- [x] Add tests for incomplete readiness, complete readiness, repeated completion, API failure recovery, and dashboard redirect.
- [x] Implement review checklist and final activation with server readiness gating.
- [ ] Verify no changes to user-owned workspace files; concurrent overlapping work is present by user authorization.

### Task 6: Preserve order snapshots and enforce kitchen safety

**Files:**
- Modify: `apps/api/internal/modules/pos/*`
- Modify: `apps/api/internal/modules/storefront/*`
- Modify: `apps/api/internal/modules/restaurant/queue.go`
- Test: affected POS/storefront/restaurant tests
- Create/modify: additive migration only if snapshot columns are absent

**Interfaces:**
- Orders capture selected service mode, modifier prices, VAT, service charge, payment method, and setup revision at creation.
- Kitchen queue continues requiring `PAID` payment and unreleased stock hold, excluding active refund and fulfillment review states.

- [ ] Add failing tests for modifier/tax/service-charge snapshots and queue exclusion predicates.
- [ ] Implement snapshot persistence without changing existing historical records.
- [x] Run focused restaurant queue tests; existing queue predicates retain paid, unreleased-hold, refund, and fulfillment-review exclusions.

Current gap: modifiers, real tax/service-charge pricing, SQL and refund reconciliation, and immutable financial snapshots remain missing. Setup service, payment, and auto-confirm flags also need downstream enforcement. Logo storage remains absent. Do not claim Task 6 complete until the approved implementation and matching tests exist.

- [?] Runtime acceptance for Task 6 is blocked pending implementation, the charge-basis decision, and a verified disposable database target.

### Task 7: Full verification and independent review

**Files:**
- No source changes unless verification exposes a task-owned defect.

- [ ] Run `go test ./... -count=1`, `go vet ./...`, and `go build ./...` from `apps/api` against the final integrated changes. Previous checked results are historical.
- [ ] Run `npm run test`, `npm run contracts:check`, `npm run typecheck`, `npm run lint`, and `npm run build` against the final integrated changes. Previous checked results are historical.
- [?] Run isolated disposable database acceptance for migrations, RLS, tenant denial, idempotency, and setup completion; Docker and PostgreSQL executables and a verified disposable target are unavailable.
- [ ] Run the full browser journey at 320/768/1440px with an appropriate environment. The reported mocked-API viewport runs cover only the first screen.
- [ ] Dispatch and receive independent `code-reviewer` and `security-auditor` review against the final diff.
- [ ] Mark each check PASS, FAIL, or BLOCKED with current evidence; Task 6, DB acceptance, browser acceptance, and independent review remain open.
