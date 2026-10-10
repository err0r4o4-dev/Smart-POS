# SmartPOS — Phase 1 / Phase 2 / Phase 3 / Phase 4 checklist

Status: **Phase 0–4 COMPLETED for the local acceptance gates** (2026-10-10), not production readiness. **Phase 5+ is NOT STARTED.** Current evidence: `docs/development/phase4-verification.md` and `docs/development/verification.md`. This finalization passes 75 frontend tests, 300 purchasing/shelf assertions, 18 browser tests, Go race checks and actual Phase 0–3 regressions. Earlier counts/checklists remain historical evidence, not current run totals.

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
