---
name: smartpos-frontend
description: Implement or inspect SmartPOS React/TypeScript pages, workspace navigation, forms, API clients, and client/server state using existing Vite, React Router, and TanStack Query patterns. Use for apps/web behavior; add visual or API-contract guidance only when those boundaries change.
---

# SmartPOS Frontend

## Inputs and ownership

Read `AGENTS.md`, affected code/tests, current diff, and relevant workspace/domain
docs. All paths are repository-root relative.

- `apps/web/src/app`: router, providers, access, config, workspace navigation.
- `apps/web/src/features`: feature composition and behavior.
- `apps/web/src/layouts`, `apps/web/src/components`: shells and shared UI.
- `apps/web/src/lib`: established API clients, errors, shared helpers.
- `apps/web/src/styles`: canonical tokens and existing domain styles.

## Workflow

1. Trace the route/workspace, components, data consumers, permission presentation,
   existing test seams, and user changes before editing.
2. Identify reachable loading, empty, validation, success, error/retry, and denied
   states. Handle relevant states, not hypothetical capabilities.
3. Reuse the router, Query setup, fetch-based clients, typed errors, session/CSRF
   handling, and navigation helpers. Do not introduce parallel abstractions.
4. Preserve cache scoping, invalidation, cancellation, and server-state ownership.
   Avoid stale organization/workspace data leaking between tenants or users.
5. Make the smallest accessible change in existing directories. Preserve exact
   decimal-string money/quantity conventions from the owning domain.
6. Add focused behavior tests using existing Vitest/Testing Library patterns.
   Use UI verification for changed appearance and important browser interactions.

## Boundaries

- Frontend roles are UX only; backend authorization remains authoritative.
- Preserve storefront, management, staff, and onboarding separation. Extend actual
  route/navigation helpers instead of hardcoding a second workspace model. Read
  `docs/architecture/workspaces.md` and current `apps/web/src/app` code.
- Check `apps/web/package.json` for actual stack/versions. Do not import Vue/Nuxt,
  Vuetify, Axios, RHF/Zod, or Storybook requirements from reference projects.
- Add `smartpos-ui-guidelines` for styling/layout and `smartpos-api-contract` for
  public DTO changes. Do not invent endpoints or alter backend/data behavior as
  frontend convenience. New dependencies require an approved concrete need.
- Preserve existing copy conventions, Thai text coverage, visible focus, labels,
  and recoverable form input after failures.

## Verification and output

Discover scripts in `package.json` and `apps/web/package.json`. Start with focused
tests; use appropriate authorized typecheck/lint/build checks. Root `npm run test`
also checks contract inventory. Browser checks need a safe environment; do not
start a migrating application stack automatically.

Report UI/workspace behavior, affected paths/states, actual checks, and missing
visual evidence. Read-only tasks do not authorize fixes or redesigns elsewhere.
