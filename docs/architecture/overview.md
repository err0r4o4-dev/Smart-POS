# Architecture

React -> same-origin Caddy -> Go `/api/v1` -> PostgreSQL. Phase 1A adds an identity module for registration, server-managed sessions, account recovery and audit events. Future Go client -> internal FastAPI. AI has no DB credentials or authority to mutate stock/payments. AI outage cannot block checkout. No public AI gateway routes.

Phase 1B adds the organization module for tenant onboarding, branches, employee memberships/invitations, fixed roles and successful-change audit. Global account/session identity remains separate from tenant membership; every tenant request rechecks authorization. See [organization design](organization.md) for transaction boundaries, the API/UI map, Owner/Manager policies, caching and security limitations.

Phase 1C adds the catalog module through the same authenticated tenant route group and organization authorization transactions. Products own descriptive data; variants own permanent SKUs, exact NUMERIC prices, units and barcode identities. Catalog is shared by an organization, not duplicated per branch. Seven catalog tables use FORCE RLS and composite tenant FKs; readiness requires migration version 4. CSV/XLSX confirmation is a bounded atomic transaction, not a background worker. See [catalog design](catalog.md). Stock/sales/pricing overrides remain later phases; no operational permission is implied by a role name.

Caddy and Go share a dedicated proxy network with separate fixed addresses: Caddy defaults to `172.30.42.2`, Go to `172.30.42.3`. Fixing both prevents Docker allocating Caddy's trusted address to the API during startup. Only these two services join that network. Go trusts a single configured proxy peer, never an entire Docker/private subnet. Other services and test clients are untrusted. Caddy's existing forwarding defaults are retained without additional forwarding-header overrides.

Password-reset HTTP requests validate and enqueue normalized addresses into a bounded, process-local queue before any account lookup or SMTP work. A single worker issues hashed, expiring tokens and sends mail with bounded deadlines. This is best-effort delivery, not a durable queue or distributed worker system.

Future `apps/api/internal/modules/<domain>/{domain,application,infrastructure,transport}` folders appear with real use cases, not empty packages. Domain owns entities/rules/repository interfaces; application owns authorization/transactions; infrastructure implements adapters; transport maps DTOs/errors. Dependencies point inward; no business rules in handlers.

Frontend `features/<module>` owns UI; layouts own shells; components/ui owns primitives; app owns router/providers/config. Planned route inventory is separate from active routes. Presentations use `/preview/*`, not fake working `/pos` or `/login`.

Database is transactional truth. Future outbox persists with business changes. Reporting consumes published read models, not another module's repository. Catalog money uses exact NUMERIC(18,2) with organization currency and decimal strings across Go/JSON/TypeScript, never binary floating-point arithmetic. Future transaction totals may use explicitly validated minor-unit conversion; fractional inventory quantities and rounding policies remain Phase 2 decisions. Unit conversion metadata uses NUMERIC(18,6).

## Decisions

- One Go deployment reduces operations for five developers. Explicit domain ownership avoids coupling. Independent Python service isolates model dependencies/failures without premature microservices.
- TanStack Query handles actual server status. Forms/charts/Zustand/ML/sqlc/Redis/MinIO are deferred until needed.
- Foundation organizations/branches and global identity tables remain separate. Phase 1B extends existing tenant tables, adds explicit memberships/composite FKs, sets a non-owner `smartpos_runtime` role and transaction-local tenant/user context. Organization/branch RLS is defense in depth; membership/invitation tables rely on explicitly scoped application queries, not full RLS.
- CSS is the canonical token source mapped into Tailwind. Local variable fonts avoid external requests. Glass is selective with solid fallback.
- Liveness is process-only; readiness requires DB ping and clean schema version 4. AI is not a readiness dependency.

Planned domains: identity, organization, employees, catalog, inventory, shelves, sales, payments, registers, purchasing, suppliers, pricing, promotions, customers, loyalty, quality, reporting, intelligence, notifications, approvals, audit, settings. Sixteen UI modules aggregate these boundaries. Workers/storage/jobs/events appear only when used.
