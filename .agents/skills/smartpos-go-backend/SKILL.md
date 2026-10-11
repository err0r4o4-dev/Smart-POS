---
name: smartpos-go-backend
description: Implement or inspect SmartPOS Go handlers, services, domain behavior, validation, authorization, context/timeouts, and logging using the existing chi/net-http modular monolith. Use for apps/api work; add database, contract, or Go-testing guidance only for affected boundaries.
---

# SmartPOS Go Backend

## Inputs and ownership

Read `AGENTS.md`, the affected module/callers/tests, and owning domain documents.
Paths are repository-root relative. Check `apps/api/go.mod` rather than imposing
another project's Go version, framework, ORM, or package layout.

- `apps/api/cmd/server/main.go`: startup, shutdown, timeouts, wiring.
- `apps/api/internal/transport/router.go`: chi/net-http route composition.
- `apps/api/internal/modules`: actual handlers, services, queries, domain tests.
- `apps/api/internal/platform`: shared HTTP, database, configuration helpers.

## Workflow

1. Trace routes, DTO parsing, validation, authorization, service behavior,
   persistence, error mapping, and actual consumers before editing.
2. Define relevant success, invalid, denied, not-found, conflict, and failure
   behavior. Preserve shared response/error conventions.
3. Reuse organization authorization/transaction helpers and explicit branch
   scoping. Check ownership server-side; URL identifiers and frontend roles are
   untrusted. Read `docs/security/security-model.md` and
   `docs/architecture/organization.md` for affected trust boundaries.
4. Make the smallest cohesive change. Keep business rules out of transport parsing
   and preserve established cross-module stock/pricing/settlement ownership.
5. Propagate context/cancellation and bounded timeouts through persistence and
   integrations. Preserve resource cleanup/graceful shutdown. Add goroutines,
   queues, or abstraction only for a concrete approved need.
6. Add relevant regression coverage and verify through `smartpos-go-testing`.

## Rules

- Handle errors explicitly and preserve classification/wrapping as needed. Do not
  leak DB errors, credentials, tokens, or personal data. Reuse `slog`/HTTP helpers.
- Preserve exact decimal contracts, transactions, idempotency, immutable history,
  and audit events where touched. Do not invent rounding, stock, or refund rules.
- Use `smartpos-go-database` for persistence and `smartpos-api-contract` for public
  endpoint/DTO changes. Internal AI does not become a public browser backend.
- Do not refactor adjacent modules, introduce an ORM, change auth mechanisms,
  start services, or migrate merely to make implementation convenient.
- Secure implementation is required. A separate audit or Reviewer is not
  automatically authorized by touching authentication code.

## Verification and output

Start with focused Go/domain/HTTP tests, then appropriate authorized vet/build/race
or integration checks with actual prerequisites. Report endpoints, boundaries,
contracts/data impact, actual checks, and limitations. Inspection requests stop
after explaining the flow without implementation.
