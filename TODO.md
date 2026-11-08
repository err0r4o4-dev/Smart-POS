# Task: Fix E2E Test Failures in CI (workspace-areas.spec.ts)

## Objective
- Diagnose and fix the failing E2E tests in 	ests/e2e/workspace-areas.spec.ts shown in GitHub Actions CI run (customer layout isolation and restaurant-only dashboard).

## Scope & Affected Components
- 	ests/e2e/workspace-areas.spec.ts
- Relevant frontend layouts/components/translations if applicable (StorefrontLayout.tsx, ShopCatalog.tsx, ManagementLayout.tsx, DashboardPage.tsx)

## Implementation Checklist
- [x] Phase 1: Reproduce failures locally
  - [x] Launch web server on port 8088 and run playwright test tests/e2e/workspace-areas.spec.ts
  - [x] Capture the exact failure messages and causes
- [x] Phase 2: Analyze root cause and formulate fix
  - [x] Investigate why customer layout isolation failed at 320px, 768px, 1440px
  - [x] Investigate why restaurant-only dashboard failed at 320px, 768px, 1440px
- [x] Phase 3: Implement fix
  - [x] Apply necessary fixes to test assertions or application code
- [x] Phase 4: Verification & Testing
  - [x] Run playwright test tests/e2e/workspace-areas.spec.ts and verify all tests pass
  - [x] Run web unit tests, lint, and typecheck
  - [x] Verify no regressions

## Risks & Architecture Notes
- Maintain bilingual (Thai/English) compatibility if test assertions or UI text are sensitive to language.
- Ensure viewport responsiveness across 320px, 768px, and 1440px.
