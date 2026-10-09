# SmartPOS — Phase 1A checklist

Status: **COMPLETED for the local acceptance gate** (2026-10-09). This tracks Authentication & Security only, not production readiness. Phase 1B (organization, branch management and RBAC) and Phase 1C have not started. See the dated finalization entry in `docs/development/verification.md` for executed evidence, earlier failures and operational limitations.

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
- [x] Phase 1B prerequisites recorded separately: non-owner runtime role, authoritative organization/branch membership, tenant context and RBAC. Phase 1B/1C remain **NOT STARTED**.

No commit, push, deployment, destructive database operation or security-limit relaxation is implied by this file.
