# Architecture

React -> same-origin Caddy -> Go `/api/v1` -> PostgreSQL. Phase 1A adds an identity module for registration, server-managed sessions, account recovery and audit events. Future Go client -> internal FastAPI. AI has no DB credentials or authority to mutate stock/payments. AI outage cannot block checkout. No public AI gateway routes.

Future `apps/api/internal/modules/<domain>/{domain,application,infrastructure,transport}` folders appear with real use cases, not empty packages. Domain owns entities/rules/repository interfaces; application owns authorization/transactions; infrastructure implements adapters; transport maps DTOs/errors. Dependencies point inward; no business rules in handlers.

Frontend `features/<module>` owns UI; layouts own shells; components/ui owns primitives; app owns router/providers/config. Planned route inventory is separate from active routes. Presentations use `/preview/*`, not fake working `/pos` or `/login`.

Database is transactional truth. Future outbox persists with business changes. Reporting consumes published read models, not another module's repository. Money uses integer minor units + currency; fractional quantity uses numeric(18,3) + unit, never float money.

## Decisions

- One Go deployment reduces operations for five developers. Explicit domain ownership avoids coupling. Independent Python service isolates model dependencies/failures without premature microservices.
- TanStack Query handles actual server status. Forms/charts/Zustand/ML/sqlc/Redis/MinIO are deferred until needed.
- Foundation organizations/branches and Phase 1A global identity tables are separate. Fail-closed RLS foundation; Phase 1B needs a non-owner runtime role and authorized transaction-local tenant context before tenant data endpoints.
- CSS is the canonical token source mapped into Tailwind. Local variable fonts avoid external requests. Glass is selective with solid fallback.
- Liveness is process-only; readiness requires DB ping and clean schema version 2. AI is not a readiness dependency.

Planned domains: identity, organization, employees, catalog, inventory, shelves, sales, payments, registers, purchasing, suppliers, pricing, promotions, customers, loyalty, quality, reporting, intelligence, notifications, approvals, audit, settings. Sixteen UI modules aggregate these boundaries. Workers/storage/jobs/events appear only when used.
