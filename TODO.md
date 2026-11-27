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

### Market Pilot v2 — retained local draft import (temporary, completed 2026-11-27; remove after handoff)

- [ ] Complete retained operator wiring and review. Added the draft-only runner with owner binding, stop-on-ambiguity, journal events, and private/public readback checks; 36 catalog fixture tests passed. Review requires confirming the exact live target, isolated browser session, and durable private journal before running. Root `npm test` reports six unrelated HelpPage/layout failures (`ChevronDown is not defined`).
- [x] Verify the retained snapshot archive in private on-machine storage with seven-day retention. Operator-run `pg_dump`/`pg_restore` passed; size and SHA-256 matched, owner-only ACL confirmed, retain until 2026-12-04 08:35 UTC.
- [x] Provision the local import Owner through normal account, email, and MFA flows; import only the approved drafts. Private run folder `market-pilot-import-2026-11-27T08-56-16-995Z`.
- [x] Verify all 13 drafts and 195 menus, unchanged retained storefront and public directory. Runner and read-only SQL: 13 hidden/closed, 195 listings, 0 public market stores, schema 54 clean, draft detail 404.
- [x] Serve the 208 market images: copied the packaged WebP files to `apps/web/public/images/market-sip-soi/v2/` (untracked, about 18 MB). All 208 SHA-256 values matched through `localhost:8088`.
- [x] Publish all 13 stores with `accepting_orders=false`. Public verifier passed: 13 stores, 195 menus, 13 covers, retained store unchanged. The browser loaded 16/16 images after lazy scroll.
- [ ] Hand off owner access, then remove the private credential file. Decide whether to commit the market images. No independent review has covered the draft runner, publish runner, or post-review `runMarketDrafts` edits.

### Market Pilot — storefront categories and public hours (temporary)

- [x] Investigate live category coverage, source hours, and the presentation/ordering boundary.
- [x] Execute the scoped design; observe failing Go, web, and catalog regression tests before implementation.
- [ ] Integrate the five categories and optional hours from `.local/storefront-details-work/` after acceptance. The offline 13-shop updater and tests are in `tests/fixtures/market-pilot/`; 42/42 fixture tests passed. Go test/vet/build, copied contract check and targeted storefront web tests/lint passed.
- [ ] Verify migration and exact 13-shop updates on disposable PostgreSQL. The host classifier denied the disposable container start; do not use the retained database. Full web suite has seven existing failures (HelpPage/layouts and CustomerHeader); existing type errors block production web build. Browser acceptance and independent review remain outstanding.
- [ ] Confirm retained rollout prerequisites and authorization before migrating or updating published stores; verify all 13 stores and the unchanged retained storefront afterward.
