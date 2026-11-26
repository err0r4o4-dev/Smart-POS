# ADR 0001 - Incremental monorepo foundation

Status: accepted for Phase 0 implementation.

Context: new repository, five developers, 16 modules/106 planned pages, transactional POS/inventory core, Python intelligence needs independent dependencies.

Decision: React/Vite/TypeScript + Go Chi/pgx modular monolith + internal FastAPI + PostgreSQL + same-origin Caddy in Compose. Domain folders are created with working use cases. Minimal organizations/branches migration only. Advisory AI, explicit transactions/idempotency planned. No fake auth/payment/predictions. No Redis/MinIO/ML/sqlc until needed.

Consequences: simpler local operation and clear business ownership; later phases must implement session security, non-owner tenant-scoped DB access, transactional inventory and durable events before their business endpoints. Architecture alone is not evidence of security/completeness. Phase 0 checks and remaining gates are recorded separately.
