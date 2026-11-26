---
name: python-fastapi
description: 'Implement or inspect Python FastAPI request/response schemas and internal HTTP behavior. Use for service boundaries, not model/provider changes.'
metadata:
  origin: local-authored
---

# Python and FastAPI Services

Inspect pyproject.toml, existing Pydantic/settings usage, routes and tests. Follow the actual Python/framework versions and dependency patterns; do not introduce a new stack.

- Validate the relevant schema at the boundary, including missing/extra fields, bounds, units, finite numbers and version compatibility as required by the contract.
- Keep transport parsing, domain/inference behavior and integration clients separated through existing seams. Match public/internal response and error conventions.
- Use asynchronous I/O only for appropriate operations; keep CPU-bound work from blocking the request loop using existing bounded mechanisms, not speculative worker infrastructure.
- Preserve request cancellation, deadlines, size limits, cleanup and service authentication. Do not leak exceptions, secrets or private input data.
- For SmartPOS, Go owns public authorization, tenant snapshots, primary persistence and retail actions. The browser must not call internal AI directly; read smartpos-ai-service for that integration.
- Health/schema checks do not measure forecast accuracy. This skill does not authorize training, paid inference, production data access or a model/provider switch.

Use python-testing for affected schema, timeout and failure cases. Read [boundary cases](references/boundary-checklist.md) for the requested endpoint. Report implementation versus planned behavior and actual checks.
