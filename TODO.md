# SmartPOS — Phase 1A / Phase 1B checklist

Status: **Phase 1A and Phase 1B COMPLETED for the local acceptance gates** (2026-10-09), not production readiness. Phase 1C has not started. See the dated entries in `docs/development/verification.md` for executed evidence, earlier failures and operational limitations. The Phase 1A checklist below preserves its original 16-unit/13-browser-test historical counts; the current suite has 22 unit tests and 14 browser tests.

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
