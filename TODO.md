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


## VELO Assistant

- [/] Switch between discovery, restaurant, and merchant guide; reuse public catalog and help content.
- [ ] Verify fallback, restaurant switches, and desktop/mobile behavior.
- [ ] Add a reviewed public queue summary and keep individual orders on private tracking.
- [ ] Add durable support cases and notification after the developer destination is agreed.

## Simplify public discovery navigation

- [x] Keep Explore as the main navigation entry and keep area browsing on Main.
- [x] Remove misleading food category shortcuts and verify desktop and mobile navigation.
- [?] Recheck the web workspace typecheck after the VELO Assistant translation errors are resolved.
