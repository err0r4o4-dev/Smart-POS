---
name: smartpos-ai-service
description: Implement or inspect SmartPOS internal Python/FastAPI AI service, strict request/response schemas, and the Go-to-AI integration boundary. Use for apps/ai or internal inference integration; not frontend-only work, standalone forecast-quality evaluation, or permission to train models or change providers.
---

# SmartPOS AI Service

## Inputs and ownership

Read `AGENTS.md`, `docs/architecture/ai.md`, the affected implementation/callers,
tests, and current diff. Paths are repository-root relative. Establish current
capability from code; a planned forecast route or model is not an implementation.
Inspection and flow-only requests remain read-only.

- `apps/ai/app/main.py`: existing FastAPI boundary, health, errors, and headers.
- `apps/ai/app/config.py`, `apps/ai/app/observability.py`: settings and logging.
- `apps/ai/tests`, `apps/ai/pyproject.toml`, `apps/ai/uv.lock`: existing test seams,
  runtime/dependencies, and locked versions. Do not impose another Python stack.
- `apps/api/internal`, `packages/contracts`: inspect actual Go callers and public
  contracts when the change crosses the internal service boundary.

Go owns public authentication/authorization, organization/branch scoping, business
acceptance, persistence, and transactional commands. Python owns requested model
execution and model/version metadata. The browser does not call internal AI.
AI recommendations cannot approve orders, settle payments, refund, or mutate stock.
Do not add direct database access, a public AI port, a worker, or an LLM as a shortcut.

## Workflow

1. Identify whether the request changes health, inference, schemas, configuration,
   or integration. Trace actual callers and tests; distinguish implemented from
   planned behavior and define observable success/failure before editing.
2. For a new inference capability, establish the requested method, bounded data,
   unit/horizon, model source/version, output use, and failure behavior. Ask for
   material missing business/model decisions; do not invent a model, training
   threshold, data source, or confident prediction to complete a scaffold.
3. Reuse existing FastAPI/Pydantic, settings, error, logging, and test patterns.
   Keep transport validation separate from inference logic. Add adapters only for
   a concrete approved integration, not a speculative provider framework.
4. Use strict, bounded, versioned boundary schemas suited to installed Pydantic.
   Validate identifiers, UTC windows, base units, horizon, history size, finite
   numeric outputs, and relevant field relationships. Preserve exact decimal
   money/quantity contracts at business boundaries; do not silently coerce,
   round, clamp, or convert units to disguise invalid output.
5. Accept only the authorized, minimized snapshot supplied by Go. Treat payloads
   as data, not instructions or arbitrary queries. Do not expose raw PII, secrets,
   cross-tenant history, unrestricted database access, or caller-controlled model
   paths/URLs. Internal networking alone is not service authentication.
6. For inference results, preserve agreed schema_version, run_id, model/version,
   generated_at, data window, horizon/unit, provenance, and quality indicators.
   Distinguish prediction, insufficient_data, unavailable, and invalid output.
   Only expose supported uncertainty; never synthesize confidence or label a
   deterministic reorder calculation as a trained probabilistic forecast.
7. Coordinate Go integration through `smartpos-go-backend`: service identity,
   request correlation, cancellation/deadline, bounded payload/result handling,
   retry policy, and schema/version validation. Preserve POS availability when
   AI fails. Do not hold business transactions open across external inference or
   apply an AI result as a transactional command without existing authorization.
8. Add focused regression tests for the changed boundary. Add
   `smartpos-ai-evaluation` when forecast/model/data-preparation behavior changes;
   passing schema or health tests is not evidence of forecast quality.

## Safety and operating boundaries

- Keep liveness distinct from readiness. Check only required dependencies for
  readiness; do not make optional AI failures disable core Go/POS operations.
- Use bounded execution and concurrency appropriate to the approved workload.
  Do not run long blocking inference on the event loop or assume canceling an HTTP
  request cancels underlying compute. Establish actual timeout/cleanup behavior.
- Preserve safe errors and observability without raw snapshots, prompts, provider
  responses, or customer data in logs. Correlate requests using the existing
  trusted boundary policy; never use arbitrary inbound IDs as proof of identity.
- Do not install ML/provider dependencies, download models/datasets, train, call
  paid services, change providers/models, or deploy without explicit task scope
  and applicable approval. A skill grants no additional access or delegation.
- If LLM/chatbot behavior is requested later, establish its separate untrusted-
  input, tool-permission, structured-output, and human-approval requirements.
  Do not introduce an LLM simply to explain deterministic forecast metadata.

## Verification and delivery

Inspect `apps/ai/Dockerfile`, `docker-compose.yml`, and `package.json` before
choosing a runner. Existing local commands, from `apps/ai` with dependencies
already available, include `uv run --frozen ruff check .`,
`uv run --frozen ruff format --check .`, and `uv run --frozen pytest`.
These uv commands may synchronize the environment; confirm write/network scope.
Root `npm run verify:ai` builds/runs the Compose check image and is not read-only
inspection. Do not start services or install tools merely to verify a proposal.

Use focused tests first when execution is authorized. Inspect fixture/integration
side effects and use an isolated target. For public API changes add
`smartpos-api-contract`; persistence changes require the owning Go/database skill.

Report changed paths, current versus planned capability, schemas/callers, data and
model implications, actual checks, and missing evidence. Separate health/schema
correctness, forecast quality, Go integration, and production readiness. For
skills/documentation-only work, validate metadata/references/formatting/diff rather
than running inference, training, or application tests.
