---
name: smartpos-go-backend
description: Implement or inspect SmartPOS Go handlers, services, domain behavior, validation, authorization, and internal integration reliability using the existing chi/net-http modular monolith. Use for apps/api work including Go-to-AI deadlines/retries/fallback; add database, contract, AI, or Go-testing guidance only for affected boundaries.
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

For requested Go-to-AI/internal service changes, apply the integration checklist
below and use `smartpos-ai-service` for the Python/internal schema boundary.
Do not load AI evaluation guidance for unrelated Go or health-only changes.

Start with focused Go/domain/HTTP tests, then appropriate authorized vet/build/race
or integration checks with actual prerequisites. Report endpoints, boundaries,
contracts/data impact, actual checks, and limitations. Inspection requests stop
after explaining the flow without implementation.

## Internal integration reliability

Apply only to the affected integration, not as an automatic hardening/refactor pass.
Inspect current clients, configuration, tests, and the agreed failure contract.

- Carry the request context and bounded deadline through the HTTP call. Budget
  connection, response, and any retry within that deadline; stop on cancellation.
  Reuse established clients/transports, close response bodies, and bound request/
  response sizes and concurrency. Do not invent timeout values without workload
  context or hold PostgreSQL business transactions open during AI/network calls.
- Retry only eligible transient failures for operations with an established safe
  replay contract. Bound attempts/backoff by the original deadline. Do not retry
  authorization/validation failures, create a fresh operation identity, or blindly
  retry settlement/refund/stock writes. Preserve existing idempotency semantics.
- Preserve service authentication and trusted request correlation. Go authorizes
  and minimizes each organization/branch snapshot; AI-returned identifiers are
  not authority to switch tenants or expand access. Validate schema/model version,
  horizon/unit, provenance, freshness policy, and finite outputs before use.
- Separate insufficient_data, unavailable, timeout, canceled, and invalid output.
  Follow agreed public error/status behavior; never replace a failed forecast
  with a fabricated zero or successful action. Core POS must not depend on optional
  AI availability. Propose a circuit breaker/queue only for a concrete approved need.
- Reuse structured logs/request IDs and existing metrics where present. Record
  status, latency, attempts, and bounded outcome labels without raw snapshots,
  prompts, secrets, or customer data. Adding telemetry infrastructure or exporting
  data is separate scope; ordinary logs do not prove end-to-end tracing exists.
- For changed behavior, add focused deterministic `httptest`/existing-client tests
  for relevant cancellation/deadline, bounded retries, malformed/oversized output,
  and degraded-service cases. Do not call live AI/providers to test transport.
  Add `smartpos-ai-evaluation` only when forecast/model quality is also affected.

This checklist describes required decisions for requested integration work, not
evidence that a Go-to-AI client, retries, metrics, or fallback already exists.
