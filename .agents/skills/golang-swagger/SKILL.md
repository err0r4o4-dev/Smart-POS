---
name: golang-swagger
description: 'Maintain Go API OpenAPI schemas manually and check producers/consumers. Use for API documentation changes; no Swagger code generation.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go OpenAPI and Swagger Contracts

Read the existing contract format and real handlers/consumers. In SmartPOS, packages/contracts/openapi.yaml and packages/contracts/routes.json are the public contract sources; use smartpos-api-contract for cross-boundary changes.

- Edit the existing OpenAPI by hand. Do not install swag, run swag init, generate handler annotations, or add a Swagger UI service.
- Match paths, operations, authentication, status codes, error envelopes, pagination, nullability and exact quantity/money types to implementation.
- Distinguish internal FastAPI schemas from the public Go API. Do not expose internal inference directly to the browser.
- Update affected consumers and contract tests in the same requested change. API examples use synthetic values, never real tokens or customer data.
- Discover and run the existing contract inventory check; do not treat valid YAML as complete runtime acceptance.

Use the [contract checklist](references/contract-checklist.md) for targeted verification. Report compatibility changes and any documentation/implementation disagreement instead of silently redesigning the API.
