# Market Pilot Implementation Plan

**Goal:** Prepare a repeatable local-only SmartPOS dataset for the approved 12-store pilot.

**Architecture:** Keep the catalog, validation and offline exports under `tests/fixtures/market-pilot`; do not add a production route or migration. Validate and exercise the installed API only after a task-owned loopback PostgreSQL instance has been identified. Treat payment-provider simulation separately from actual provider verification.

**Tech stack:** Node 24 standard library, SmartPOS React and Go, PostgreSQL.

**Spec:** Approved pilot in the task conversation: 12 Thai storefronts in 12 categories, 180 menu items and 4 operational walkthroughs.

## Constraints and recovery

- No retained database, production service, external requests, real contacts or payment credentials.
- Store exact prices in satang. Keep asset prompts separate from rendered paths until images exist.
- Do not claim a region directory, per-store cover rendering, payment, or access-control capability where acceptance has not run.
- Source fixtures are the recovery input. Recreate or discard only the established task-owned database; never clean a retained target.

## Tasks and checks

- [ ] Write failing checks for exact catalog counts, demo-specific identifiers, fixed point amounts, scenario references and safe output. Build the catalog, validate it, and export a standalone preview and per-store setup request bodies. Run `node --test tests/fixtures/market-pilot/catalog.test.mjs`.
- [ ] Generate shop covers and menu photos via the approved image capability. Verify each requested asset exists and maps to one item, then inspect how the actual shop UI renders at desktop and mobile widths.
- [ ] Confirm a new loopback-only PostgreSQL target; use existing setup and publish commands to provision data, and verify a second run produces no duplicates. Apply no production migrations.
- [ ] Run the four anchor flows against the isolated app; compare actual order, payment, queue, receipt and sale state, including denied cross-store access. Review date- and funds-sensitive outcomes independently before acceptance.

## Review focus

Check price arithmetic and paid-queue invariants, non-public draft isolation, duplicate import behavior, demo-only credentials and destinations, and gaps between fixture data and current public UI capabilities.
