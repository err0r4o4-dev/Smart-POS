# Task Checklist: Redesign and Standardize `/manage/sales` Page

- [x] Inspect project instructions (`AGENTS.md`, `CLAUDE.md`), skills (`smartpos-frontend`, `smartpos-ui-guidelines`, `frontend-testing`), and existing `/manage/sales` implementation (`SalesPages.tsx`, `pos.css`, `pos-api.ts`, `i18n/pos.ts`, tests).
- [x] Define observable acceptance criteria and write failing component/interaction tests in `apps/web/src/features/pos/SalesPages.test.tsx`.
- [x] Add Thai and English i18n keys in `apps/web/src/i18n/pos.ts` for KPI summary cards, filter controls, date presets, payment tabs, table actions, export, and pagination.
- [x] Implement standardized `SalesPage` UI in `apps/web/src/features/pos/SalesPages.tsx` and styles in `apps/web/src/styles/pos.css` matching the target design while preserving existing routes, tenant scoping, exact decimal calculations, and accessibility.
- [ ] Run verification checks (`vitest`, `messages.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`) and inspect `git diff`.
  - Blocker: PowerShell / Bash / MCP diagnostics execution is blocked by host auto-mode classifier (`titunnn_anti[1m] is temporarily unavailable`). Commands to run when available: `npm run test --workspace @smartpos/web -- src/features/pos/SalesPages.test.tsx src/features/pos/Receipt.test.tsx src/i18n/messages.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] Clean up temporary `TODO.md` after verification passes.

## ออกแบบและพัฒนาหน้า `/manage/dashboard` ตามภาพต้นแบบ

- [x] สำรวจโค้ดปัจจุบันของหน้า `/manage/dashboard` (`WorkspacePages.tsx`, `workspace.css`, `i18n/workspace.ts`) และชุดทดสอบที่เกี่ยวข้อง
- [x] ออกแบบเกณฑ์การยอมรับและอัปเดต Unit Tests ใน `apps/web/src/features/workspace/WorkspacePages.test.tsx` สำหรับหน้า `/manage/dashboard` รูปแบบใหม่
- [x] เพิ่มข้อความแปลภาษาไทยและอังกฤษใน `apps/web/src/i18n/workspace.ts` โดยให้ผ่าน `messages.test.ts`
- [x] พัฒนา `ManagementHomePage` ใน `apps/web/src/features/workspace/WorkspacePages.tsx`, ปรับปรุง Header (`ManagementLayout.tsx`), Sidebar Menu (`NavigationMenu.tsx`, `routes.ts`), และสไตล์ใน `apps/web/src/styles/workspace.css` และ `apps/web/src/styles/global.css` ให้ตรงตามภาพต้นแบบทุกส่วน
- [ ] รันการตรวจสอบ (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) และตรวจสอบ `git diff`
  - Blocker: PowerShell / terminal execution is temporarily blocked by the host auto-mode safety classifier. Commands to run when available: `npm --prefix apps/web test -- --run src/features/workspace/WorkspacePages.test.tsx src/layouts/NavigationMenu.test.tsx src/i18n/messages.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] ลบเฉพาะหัวข้องาน `/manage/dashboard` ออกจาก `TODO.md` หลังตรวจสอบสำเร็จครบถ้วน

## ออกแบบและปรับมาตรฐานทุกหน้าของระบบโดยยึด `/manage/sales` เป็นพื้นฐาน

- [x] สำรวจโครงสร้างหน้าและไฟล์สไตล์ทั้งหมด (`global.css`, `catalog.css`, `pos.css`, `inventory.css`, `purchasing.css`, `returns.css`, `customers.css`, `loyalty.css`, `pricing.css`, `quality.css`, `storefront.css`, และ UI Primitives)
- [x] อัปเดตและเพิ่มการทดสอบใน `apps/web/src/features/pos/SalesPages.test.tsx` ให้ครอบคลุมหน้ารายละเอียดการขาย (`SaleDetailsPage`) และมาตรฐาน UI ที่ใช้ร่วมกัน
- [x] ปรับปรุงระบบ Design System กลาง (`global.css`, `catalog.css`) ให้ทุกหน้ามี Page Heading, Navigation Pill Tabs (`.catalog-nav`), Filter Cards, KPI/Summary Cards, Record/Catalog Tables, Badges และ Pagination มาตรฐานเดียวกับ `/manage/sales`
- [x] ปรับปรุงสไตล์เฉพาะโดเมน (`pos.css`, `inventory.css`, `purchasing.css`, `returns.css`, `customers.css`, `loyalty.css`, `pricing.css`, `quality.css`) และหน้ารายละเอียดการขาย (`SaleDetailsPage`) ให้สอดคล้องกับมาตรฐาน `/manage/sales`
- [ ] รันการตรวจสอบ (`vitest`, `npm run typecheck`, `npm run lint`, `npm run build`) และตรวจสอบ `git diff`
  - Blocker: PowerShell / Bash / MCP diagnostics execution is temporarily blocked by the host auto-mode safety classifier (`titunnn_anti[1m] is temporarily unavailable`). Commands to run when available: `npm run test --workspace @smartpos/web`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] ลบเฉพาะหัวข้องานที่เสร็จสมบูรณ์ออกจาก `TODO.md` หลังตรวจสอบผ่าน

