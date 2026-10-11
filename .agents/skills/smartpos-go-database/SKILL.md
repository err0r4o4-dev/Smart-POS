---
name: smartpos-go-database
description: Implement or inspect SmartPOS pgx/PostgreSQL queries, persistence, migrations, tenant scoping, and transactional retail operations. Use for database behavior changes; preserve exact decimals, ledger/idempotency invariants, and isolated verification without automatically migrating or resetting data.
---

# SmartPOS Go Database

## Inputs

Read `AGENTS.md`, affected queries/services, migrations, and domain policies. Paths
are repository-root relative. Start with
`apps/api/internal/platform/database/database.go`, the affected module, and only
relevant files in `database` and `docs/database`.

Ownership references include `docs/architecture/organization.md`,
`docs/database/inventory-ledger.md`, `docs/database/sales-transactions.md`, and
the affected domain's architecture/business-flow documents. Do not freeze current
schema versions or historical database names in this skill.

## Workflow

1. Trace command/read models, tenant/branch scope, transaction helpers, constraints,
   locks, ledger posting, and consumers before modifying SQL.
2. Define affected invariants and relevant failure/retry/concurrency cases.
3. Parameter-bind values through pgx. Dynamic identifiers need established
   validation/allowlisting, not untrusted string interpolation.
4. Preserve transaction-local authorization context and organization/branch
   filters. RLS is defense in depth, not a replacement for scoped queries; inspect
   the actual policies and database role for affected tables.
5. Reuse transactions and lock ordering. Keep related posting, audit, and
   idempotency results atomic where required; do not split one business commit.
6. Preserve cancellation and row/connection/transaction cleanup. Keep decimal
   precision/string boundaries; do not silently change rounding, scale, or units.
7. Add focused coverage and use `smartpos-go-testing` with a confirmed isolated
   target for data verification.

## Data-change boundaries

- Preserve append-only movements, immutable sale/refund/loyalty history, snapshots,
  conflict/version checks, and established compensation where applicable. Do not
  rewrite historical records as a convenient correction.
- Author migrations only within requested schema-change scope. Do not modify
  previously applied migrations. Writing a migration does not authorize running it.
- Inspect current migration conventions, trackers, and relevant scripts. Describe
  compatibility, data impact, and irreversible steps when relevant.
- Never verify against primary data, reset volumes, delete fixtures, or run
  rollback/migration scripts automatically. Inspect target selection and cleanup
  because scripts can retain data or start services.
- Do not introduce GORM, SQL generators, or another persistence abstraction without
  an approved need. Measure query problems before optimizing.

## Output

Report tables/queries, tenant/transaction boundaries, invariants, schema/data
impact, checks, and unresolved prerequisites. Read-only requests produce findings
only; this skill grants no additional data-write or execution permissions.
