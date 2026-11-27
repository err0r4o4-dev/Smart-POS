## Store menu after sign-in

- [/] Show the owner action after sign-in and let new merchants start setup before MFA; keep MFA for protected reads and writes.
- [?] Verify the contract, frontend states, access boundaries and responsive behavior; obtain independent review before release.

## Public food categories

- [/] Persist shared food categories in storefront settings and expose them in discovery.
- [/] Replace business type selection and discovery filters across web entry points.
- [?] Verify migration and tenant isolation on an isolated PostgreSQL target; obtain independent review before release.

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

## Market pilot data

- [/] Prepare and validate 12 store profiles, 180 menu items and four operational scenarios.
- [ ] Produce and inspect food photos and store covers.
- [ ] Populate a task-owned loopback database and verify storefront and operational scenarios.
- [ ] Obtain scoped independent review for data integrity, payment and isolation before acceptance.
