## Account screen redesign

- [/] Adjust shared account layouts and sign-in/MFA presentation.
- [ ] Verify responsive layouts and existing account flows.

## Account flow: shared MFA entry screen

- [/] Match the account header and make the required MFA action explicit.
- [ ] Verify account and MFA transitions at desktop and mobile widths.

## Verified storefront ratings

- [x] Add one rating per completed order with existing tracking proof and tenant scope.
- [x] Show the customer's stored rating on tracking and anonymous aggregates on home; browser checks use synthetic API responses.
- [x] Verify the OpenAPI contract, web build, and affected browser layouts.
- [x] Verify cross-tenant isolation, concurrent retries, runtime grants and migration rollback on a new loopback PostgreSQL 17 fixture.
- [?] Obtain the required independent review before release; user authorized scoped review, but the effective Main model route cannot be confirmed for dispatch.

## VELOPOS B16: v1 menu import validation (T3.9)

- [x] Confirm the approved template and isolate this work from storefront ratings and migration 51.
- [x] Draft the [validation plan](docs/superpowers/plans/2026-11-26-b16-menu-import-validation.md).
- [x] Confirm the plan and current branch; execute within the existing checkout on non-overlapping paths only. No staging or commits.
- [x] Add parser boundary tests; IDE compiler diagnostics confirm the expected missing parser and types. The offline `go test` command did not start (permission-classifier timeout).
- [x] Write the format adapter and v1 validator without persistence or API wiring; verification is separate below.
- [x] Record focused/affected tests, package vet, full Go tests, formatting and no staging in T3.9.
- [?] Full `go vet ./...` and `go build ./...` did not start; the host permission classifier timed out repeatedly.
