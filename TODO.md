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
