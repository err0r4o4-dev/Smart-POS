# Market Pilot Storefront Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline or superpowers:subagent-driven-development only when separately authorized. Steps use checkbox (`- [ ]`) syntax for tracking. No commits without a separate request.

**Goal:** Give the 13 published Market Pilot stores filterable food categories and display their regular hours/closing day, without changing ordering status.

**Architecture:** Extend the existing storefront category contract. Use optional public `opening_hours` storefront metadata with existing MFA and revision protection, not the ordering-availability pipeline. Apply exact package-derived metadata only to the named pilot tenants after offline validation and an explicitly approved retained rollout.

**Tech Stack:** Go, PostgreSQL migrations, OpenAPI, React/TypeScript, Node fixture tests, Playwright.

**Spec:** [Market Pilot storefront details](../specs/2026-11-27-market-pilot-storefront-details-design.md)

## Global Constraints

- Preserve the existing eight categories and per-store limit of eight selections. Add `southern-thai`, `northern-thai`, `seafood`, `breakfast`, and `asian`.
- `opening_hours` is optional; Sunday=0, timezone `Asia/Bangkok`, same-day positive duration. An omitted input preserves existing hours, omitted output indicates not configured.
- All 13 shops retain published status and `accepting_orders=false`; no reviews, orders, identity, organization permissions, terminals, delivery settings, stock or menu changes. No unrelated storefront backfill.
- Use a disposable loopback database for testing. Main Compose watch must not sync a schema-55 API to a schema-54 database; isolate pre-rollout source from the retained watcher or coordinate a separately approved compatible cutover. No unapproved reviewer, migration, restart, backup or rollout.

## Review Focus

- Old client omits `opening_hours`: a checked settings update preserves saved hours (Task 1).
- Reversed times, invalid weekday/timezone, and unknown categories fail closed in API and PostgreSQL (Task 1).
- Rollback would drop saved hours or invalidate new categories: refuse without deleting data (Task 1).
- Existing shops have no hours: avoid invented opening times or changed storefront state (Task 2).
- Lost write response or revision conflict: stop all later writes, preserve the journal, do not auto-replay (Task 3).

## Task 1: Schema, API and contract

**Files:** `database/migrations/000055_storefront_public_hours.up.sql` and `.down.sql`, `apps/api/internal/platform/database/database.go`, `apps/api/internal/modules/storefront/{food_categories,domain,service,organization_settings}.go`, nearby storefront tests, and `packages/contracts/openapi.yaml`.

- [ ] Add Go validation cases for `seafood`, unknown code, `10:00–20:30`/Monday, reversed interval, weekday 7, and non-Bangkok timezone; observe failure before adding code.
- [ ] Add disposable PostgreSQL/API checks for upgrades from 54, both settings source paths, persistence after omission, rollback refusal when hours/new categories exist, and existing tenant and revision denials.
- [ ] Replace the old category constraint in migration 55, keeping existing validation and selection limit. Add nullable `opening_hours` with strict object, time, day, and timezone constraints. Down migration checks both new categories and hours before removing schema; refuse if rollback would lose data.
- [ ] Use `OpeningHours{Opens, Closes, ClosedWeekday, Timezone}` in `Settings` and `SettingsInput` with `opening_hours,omitempty`. Update shared readback and both owner save paths; do not change the existing directory projection except accepted category values. Set readiness to 55 only if isolated from the retained watcher. Update OpenAPI for request and response shapes.
- [ ] Run Go tests, vet, build and migration/HTTP acceptance on the isolated target; validate contracts. Verify a public detail has no internal terminal/branch fields.

## Task 2: Web detail and filters

**Files:** `apps/web/src/features/storefront/{food-categories.ts,ShopDirectoryGrid.tsx,StoreHero.tsx}`, owning tests, `apps/web/src/lib/storefront-api.ts`, `apps/web/src/i18n/{landing,storefront}.ts`.

- [ ] Add failing web tests: filter `seafood` finds only assigned shops; a `10:00–20:30` Monday closure renders in Thai and English; missing hours do not render a schedule; ordering-disabled banner remains unchanged.
- [ ] Add all five category options, translated labels, and icon-map entries. Reuse the existing filter and owner category picker. Render category labels and optional hours in Information using an accessible definition list. Use bilingual copy and a weekday/timezone representation that does not convert the display to the browser's local time.
- [ ] Run targeted tests, web typecheck/lint/build, and 390px/desktop browser verification with disposable data; report unrelated full-suite failures by name and do not edit existing unrelated work.

## Task 3: Exact 13-shop enrichment and rollout gates

**Files:** New `tests/fixtures/market-pilot/storefront-metadata.mjs` and `.test.mjs`; private operator harness outside tracked code only after review. Source: `.local/market-pilot/main-release-v2/catalog.json` validated against the repository package.

- [ ] Write failing tests: 13 unique approved mappings with no empty categories; five exact new category assignments; all 13 hours match the source and Thai weekdays resolve correctly; fail before writes if a listed org or storefront does not exactly match the approved target; reject a stale revision/lost reply with no later writes.
- [ ] Export `prepareStorefrontMetadata(release)` to map reviewed slugs, categories and hours without rewriting the historical release package. Use an exact organization/slug allowlist and fixed metadata-only writes; read current settings first and update only category codes and public hours. Preserve publication, closed-order status, covers, terminals and other fields. Compare retained store snapshots and journal attempted/confirmed revisions locally; do not replay automatically.
- [ ] Exercise the full enrichment in an isolated DB, confirming 13/13 nonempty/filterable categories, 13/13 exact schedules, 13/13 still published and closed, unchanged 195 menus, existing images and retained storefront, and no change in review totals. Confirm an unrelated Owner cannot write another tenant's metadata.
- [ ] Obtain authorized independent review of the scoped diff and evidence before proposing retained rollout, including rollout/recovery ordering around strict schema readiness and safe handling of uncertain writes.
- [ ] If separately approved: freshly back up retained data, verify target and baseline, apply the reviewed migration/API/web cutover, perform the metadata update via normal Owner MFA, and repeat the acceptance checks through `localhost:8088`. Stop on drift or unknown outcome; no automatic rollback of retained data.
