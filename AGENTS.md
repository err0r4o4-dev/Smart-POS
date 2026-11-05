# SmartPOS Agent Guide

## Architecture

Browser/React -> public Go API -> PostgreSQL. An internal FastAPI AI service is a
separate boundary; the Go-to-AI client is planned in `docs/architecture/overview.md`.
Go owns public HTTP, authorization, orchestration and transactions;
the browser does not call PostgreSQL or internal AI. Preserve the modular monolith
and storefront, account/onboarding, management and staff workspace boundaries.

`apps/web/src` contains the app, features, layouts, shared components and clients;
`apps/api` contains the Go server, routes, modules and platform; `apps/ai` contains
the internal AI service. Contracts are in `packages/contracts`, migrations in
`database`, verification in `tests`, and architecture and domain guidance in `docs`.
Use `.agents/skills/README.md` to select task guidance.

Preserve the Apple-inspired web and adaptive mobile direction, SmartPOS yellow,
local Thai/Latin fonts, Lucide and efficient POS density. Runtime visual tokens
are in `apps/web/src/styles/tokens.css`.

## Business rules

- Preserve exact money and quantities, their units, established rounding and
  idempotency. Do not implicitly convert or aggregate unlike units. Keep ledger
  posting, reservations, related transaction effects and audit events atomic where
  required; preserve immutable history.
- Restaurant orders require confirmed funds before kitchen work and entry into
  `PREPARING` or `READY`. The kitchen queue requires a `PAID` payment attempt
  with an unreleased stock hold and excludes specified refund states and
  `FULFILLMENT_REVIEW` reconciliations. Verify these predicates in the affected
  implementation and acceptance checks.
- Follow the approved restaurant-only transition in `TODO.md`; retain historical
  retail records and existing live dependencies until replacement acceptance.
  AI is advisory and must not autonomously perform retail actions.

## Data boundaries

- Enforce authorization and organization/branch scope on the server, including
  transaction context and scoped queries. Scope and invalidate caches on user,
  organization and branch changes. Frontend permission checks are presentation.
- Public storefront data is distinct from private employee data and order tracking
  tokens. Protect tracking tokens and keep internal AI data within the authorized
  server-side boundary.
- Single-store mode restricts a deployment to a selected existing organization;
  it does not remove tenant isolation or other organizations' data. RLS is defense
  in depth where implemented: inspect the affected policies and database role.

## SmartPOS verification

- Inspect current scripts and target selection before running them. Root
  `npm run test` runs web tests, contract inventory, log-format tests and dev-stack tests;
  `npm run typecheck`, `npm run lint` and `npm run build` target the web workspace.
  `npm run contracts:check` checks contract inventory; `npm run e2e` runs
  Playwright and needs the appropriate environment. For contract changes, verify
  consistency across producers, OpenAPI, route inventory and affected consumers.
- Database acceptance requires a confirmed isolated, task-owned disposable target.
  Protect primary and retained databases and volumes; inspect migration, fixture,
  startup and cleanup effects first. Static checks and unit tests are not database
  acceptance, and a build is not browser evidence. Historical results do not
  establish current readiness; consult current code, `TODO.md` and fresh evidence.
