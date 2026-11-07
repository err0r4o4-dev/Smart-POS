# SDD ledger — plan: docs/superpowers/plans/2026-11-08-flat-navigation-menu.md

Pre-flight:

- Task 1 produces `navigation` and `navigationGroups` in `apps/web/src/app/routes.ts` -> consumed by Task 2 (`NavigationMenu.tsx`) and Task 4 (`NavigationMenu.test.tsx`). Interfaces match (`NavigationItem[]`, `NavigationGroup[]`).
- Ruling: Omit `git commit` steps from plan execution — `CLAUDE.md` explicitly forbids committing unless the user explicitly asks to commit, and user instructions override skill defaults — cost if wrong: none, changes remain cleanly unstaged in working tree ready for user review or commit on request.
- Ruling: Add English localization mappings in `apps/web/src/i18n/shared.ts` for new section labels (`การขายและหน้าร้าน`, `จัดการร้าน`, `ตั้งค่าระบบ`, `หน้าร้านออนไลน์`) — `NavigationMenu` uses `localize()` which maps Thai labels to English via `i18n` — cost if wrong: none, ensures bilingual support works seamlessly.

Task 1: complete (tests: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx -t "assigns"` -> 2 passed)
Task 2: complete (tests: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx -t "renders all grouped links"` -> 1 passed)
Task 3: complete (CSS styles added in `apps/web/src/styles/global.css`)
Task 4: complete (tests: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx` -> 19 passed)

Final review: self-review (R06 forbids spawning subagents without explicit user authorization)
Final: fixed item ordering in `managementItems` (`apps/web/src/app/routes.ts`) so `ManagementHomePage` (`WorkspacePages.tsx`) renders task cards in the exact same logical flow order as `NavigationMenu` — suite 62/62 passed.
