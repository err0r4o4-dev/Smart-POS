# Market Pilot Main Rollout Plan

**Goal:** Show the 12 market pilot storefronts and their 180 menu items on the existing local SmartPOS gateway at `127.0.0.1:8088/shop`, alongside the existing storefront.

**Architecture:** Use the Go API and its existing tenant-scoped setup and publication controls to import the fixtures. Serve the approved covers as same-origin assets. Persist optional cover references through storefront settings and return them through the public directory and storefront detail. Keep the current business type and use food categories for discovery.

**Tech stack:** Go, PostgreSQL, React, and the existing local Docker Compose stack.

**Spec:** The approved 12-store pilot and the subsequent request to publish one cover per shop on the main local site. The initial fixture plan remains scoped to the isolated pilot.

## Prepare and verify in isolation

- Package one optimized WebP for each existing shop slug. Check that there are 12 distinct decodable files and that a preview maps every cover to its shop, category, and 15 menu items.
- Add an optional same-origin cover reference to the storefront settings contract. Keep existing shops compatible when the value is unset. Cover the private settings read/write and both public reads in Go and migration tests; update `packages/contracts/openapi.yaml` and `apps/web/src/lib/storefront-api.ts` with matching fields. Use existing food category codes and retain the fixture menu groups.
- Use the cover reference on home, Explore, and the shop header. Preserve the current fallback for missing or failed images. Check category browsing and image loading at 360, 390, and 1280 px. Coordinate with concurrent edits to the home screen before changing shared files.
- Build a separate, target-checked import command using the validated fixture data and existing authorization. Import as closed for orders, reject collisions with pre-existing stores, and prove a second run does not duplicate or overwrite anything. Keep any pilot reviews and accounts out of the transfer. Do not change the isolated catalog test's main-database guard.

## Main cutover and recovery

- Establish the main Compose target and current schema read-only. Before cutover, confirm retained-data rollout scope, obtain independent review on a scoped redacted diff and matching test evidence, and demonstrate a backup and restore on an isolated target using the project's approved storage controls.
- Publish the matching app, migration and assets; import only the named 12 stores. Verify the original storefront and its menu still work and validate all 180 new SKUs, category labels, and image responses through `8088`. Check isolation with an unrelated account.
- Keep the pilot available during verification. If a cutover step fails, stop the rollout, preserve evidence, and recover using the reviewed rollback: take the new storefronts out of the public list using supported settings, restore the prior app/schema pairing as needed, and preserve the retained database. Only stop the three pilot listeners once the main storefront is verified; keep its data for recovery.
