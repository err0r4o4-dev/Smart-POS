---
name: smartpos-api-contract
description: Assess and implement SmartPOS public HTTP contract changes across Go producers, React consumers, OpenAPI, route inventory, and tests. Use for endpoints, request/response schemas, errors, status codes, pagination, or compatibility; skip private refactors preserving the contract.
---

# SmartPOS API Contract

## Inputs and ownership

Read `AGENTS.md`, the interface request, producer/consumers, and relevant tests.
All paths are repository-root relative.

- `packages/contracts/openapi.yaml`: public API schema.
- `packages/contracts/routes.json`: route inventory; distinguish planned from
  implemented entries by inspecting the actual structure and registrations.
- `apps/api/internal/transport`, `apps/api/internal/modules`: route registrations,
  DTOs, validation, service results, HTTP error behavior.
- `apps/web/src/lib`, affected `apps/web/src/features`: frontend models, clients,
  errors, Query usage, and presentation consumers.
- `scripts/check-contracts.mjs`, `tests/integration`, module tests: existing checks.

## Workflow

1. Capture existing method/path, authorization, payloads, success/error shapes,
   status codes, pagination, nullability, and idempotency semantics.
2. Locate affected callers within the authorized repository. Do not edit another
   project merely because it may consume this API.
3. Define proposed behavior and compatibility impact. Ask when a breaking change,
   business rule, or unsupported capability remains unresolved.
4. Update producer, actual consumers, OpenAPI, relevant inventory, and focused tests
   coherently. Preserve exact decimal strings, dates, validation, auth/tenant scope.
5. Compare field names, types, optionality, array/object shape, errors, and relevant
   transitions at the real boundary, not only in shared TypeScript/Go types.
6. Use backend/frontend/database/testing skills only for affected boundaries.

## Verification and output

- Inspect `scripts/check-contracts.mjs`, then use `npm run contracts:check` when
  authorized. Inventory consistency is not proof of runtime payload correctness.
- Add focused producer/consumer behavior tests and appropriate typechecks. Cover
  relevant success, invalid input, denial, and changed error cases.
- Runtime integration requires a confirmed isolated target and authorized fixture
  writes. A schema pass or successful build does not replace integration evidence.
- Follow existing contract artifact patterns. Do not introduce Swagger generation,
  new clients/dependencies, or unrelated API redesigns.
- Report before/after contract, affected callers/paths, compatibility/data impact,
  checks actually run, and remaining gaps. Review-only tasks report mismatches
  with locations without updating artifacts.
