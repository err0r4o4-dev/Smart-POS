---
name: golang-database
description: 'Implement or inspect Go SQL access, pgx scanning and transactions. Use for database behavior; project rules own tenant and migration policy.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Database Access

Read the actual driver, repositories, service boundaries and database policies. In SmartPOS use smartpos-go-database for retail, tenant and migration invariants; do not impose another project's ORM or schema.

- Parameterize values and allowlist dynamic identifiers. Carry context through every database operation.
- Use execution APIs for statements without returned rows and query APIs when rows are returned. Close rows and check scan/iteration/commit errors.
- Preserve NULL semantics and exact decimal/money/quantity representations; do not round through binary floating point.
- Keep dependent reads/writes in the existing transaction boundary. Preserve organization/branch scope, lock order, idempotency, audit and immutable history.
- Do not hold business transactions open while calling optional AI/network services.
- Migration execution, service startup, destructive fixtures and schema changes need their own requested scope and approval. Database tests need a confirmed isolated target.

Read [transactions](references/transactions.md) or [scanning](references/scanning.md) when relevant. Validate rollback, conflict and tenant boundaries using existing test seams; unit tests are not proof of database acceptance.
