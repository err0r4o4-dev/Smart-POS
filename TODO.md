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

## ปรับปรุงเมนู Sidebar (`NavigationMenu`) ให้เปิดทุกหมวดเป็นค่าเริ่มต้นและจำสถานะข้ามการรีเฟรช (รูปแบบที่ 1)

- [x] สำรวจโค้ด `NavigationMenu.tsx`, `NavigationMenu.test.tsx`, `WorkspacePages.test.tsx`, และ `tests/e2e/sidebar.spec.ts`
- [x] เขียน Unit Tests แบบ TDD (RED) ใน `apps/web/src/layouts/NavigationMenu.test.tsx` สำหรับการเปิดทุกหมวดเป็นค่าเริ่มต้น การจำสถานะใน `localStorage` ข้ามการรีเฟรช และการกางหมวดปลายทางอัตโนมัติเมื่อนำทางเข้าสู่หมวดที่พับไว้
- [x] พัฒนา `NavigationMenu.tsx` โดยใช้ `localStorage` + `useSyncExternalStore` ให้จำสถานะแยกตามพื้นที่ (`homePath`), ไม่รีเซ็ตเมื่อเปลี่ยนหน้า, และกางหมวดปลายทางอัตโนมัติเมื่อนำทางเข้าสู่เมนูย่อยที่พับไว้ (รูปแบบที่ 1)
- [x] อัปเดตเทสต์ที่เกี่ยวข้อง (`NavigationMenu.test.tsx`, `WorkspacePages.test.tsx`, `tests/e2e/sidebar.spec.ts`, `tests/e2e/workspace-areas.spec.ts`, `tests/e2e/language.spec.ts`)
- [ ] รันการตรวจสอบ (`vitest`, `npm run typecheck`, `npm run lint`, `npm run build`) และตรวจสอบ `git diff`
  - Blocker: PowerShell / terminal execution is temporarily blocked by the host auto-mode safety classifier. Commands to run when available: `npm --prefix apps/web test -- --run src/layouts/NavigationMenu.test.tsx src/features/workspace/WorkspacePages.test.tsx src/i18n/messages.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] ลบเฉพาะหัวข้องานที่เสร็จสมบูรณ์นี้ออกจาก `TODO.md` หลังตรวจสอบผ่านครบถ้วน

## ออกแบบและปรับมาตรฐานทุกหน้าของระบบโดยยึด `/manage/sales` เป็นพื้นฐาน (ยกเว้นหน้า ภาพรวมร้าน `/manage/dashboard`)

- [x] สำรวจโครงสร้าง JSX, CSS และข้อกำหนดในชุดทดสอบ (`*.test.tsx`, `tests/e2e/*`) ของทุกหมวดเมนูเทียบกับ `/manage/sales`
- [x] สร้าง Shared Standard UI Components (`apps/web/src/components/ui/StandardPage.tsx`) และปรับ `OrganizationProvider.tsx` / `OrganizationGate.tsx` ให้รองรับ Page Header พร้อมไอคอนเหลือง, แถว KPI 4 การ์ด, การ์ดค้นหาและกรองข้อมูล (พร้อมตัวเลือกองค์กร/สาขาในตัว), แท็บกรองสถานะ และแถบแบ่งหน้ามาตรฐานเดียวกับ `/manage/sales`
- [x] ปรับโครงสร้าง JSX หมวดเมนูสินค้า (`ProductPages.tsx`, `TaxonomyPage.tsx`, `ImportPage.tsx`, `LabelsPage.tsx`, `CatalogUI.tsx`)
- [x] ปรับโครงสร้าง JSX หมวดการขายและหน้าร้านออนไลน์ (`OnlineOrderPages.tsx`, `PaymentSandboxPage.tsx`, `POSWorkspace.tsx`, `HeldCartsPage.tsx`, `CheckoutPage.tsx`, `RegisterPage.tsx`, `POSTerminalPage.tsx`, `SalesPages.tsx`)
- [x] ปรับโครงสร้าง JSX หมวดคลังสินค้า คุณภาพ และจัดซื้อ (`InventoryPage.tsx`, `QualityPage.tsx`, `PurchasingPage.tsx`, `SupplyUI.tsx`)
- [x] ปรับโครงสร้าง JSX หมวดลูกค้า สมาชิก ราคา/โปรโมชั่น และคืน/เปลี่ยน/กลับรายการ/คืนเงิน (`CustomerPages.tsx`, `LoyaltyPage.tsx`, `PricingPage.tsx`, `ReturnsPage.tsx`, `AdjustmentsPage.tsx`)
- [x] ปรับโครงสร้าง JSX หมวดตั้งค่าระบบ บัญชี คู่มือ และหน้างานพนักงาน (`OrganizationPages.tsx`, `HelpPage.tsx`, และ `StaffHomePage` ใน `WorkspacePages.tsx` โดยไม่แตะ `ManagementHomePage`)
- [ ] รันการตรวจสอบ (`vitest`, `npm run typecheck`, `npm run lint`, `npm run build`) และตรวจสอบ `git diff`
- [ ] ลบเฉพาะหัวข้องานที่เสร็จสมบูรณ์ออกจาก `TODO.md` หลังตรวจสอบผ่าน

## ลบแถบ `.tenant-switchers` (`ContextSwitchers`) ออกจากทุกหน้า

- [x] สำรวจโค้ดและการเรียกใช้ `ContextSwitchers` / `.tenant-switchers` ทั้งหมดใน `ManagementLayout.tsx`, `POSWorkspace.tsx`, `OrganizationGate.tsx`, ไฟล์ CSS และชุดทดสอบที่เกี่ยวข้อง
- [x] กำหนดเกณฑ์การยอมรับ: ทุกหน้าภายใต้ `WorkspaceShell` (`management`, `staff`, `account`) และ `POSWorkspace` ต้องไม่แสดง `<div class="tenant-switchers">` หรือ combobox สลับองค์กร/สาขาบนหน้าจอ
- [x] เขียน Unit Tests แบบ TDD (RED) ใน `apps/web/src/features/workspace/WorkspacePages.test.tsx` และ `apps/web/src/features/pos/POSWorkspace.test.tsx` เพื่อยืนยันว่าไม่มีการแสดง `.tenant-switchers` ในทุกพื้นที่หน้าจอ
- [x] ลบการเรนเดอร์ `<ContextSwitchers />` ออกจาก `apps/web/src/layouts/ManagementLayout.tsx` และ `apps/web/src/features/pos/POSWorkspace.tsx` พร้อมทำความสะอาดกฎ CSS เฉพาะจุดใน `apps/web/src/styles/pos.css` (GREEN)
- [ ] รันการตรวจสอบ (`vitest`, `npm run typecheck`, `npm run lint`, `npm run build`, `prettier --check`) และตรวจสอบ `git diff`
  - Blocker: PowerShell / Bash / MCP diagnostics execution is temporarily blocked by the host auto-mode safety classifier (`titunnn_anti[1m] is temporarily unavailable`). Commands to run when available: `npm run test --workspace @smartpos/web -- src/features/workspace/WorkspacePages.test.tsx src/features/pos/POSWorkspace.test.tsx src/features/organization/ContextSwitchers.test.tsx`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [ ] ลบเฉพาะหัวข้องานนี้ออกจาก `TODO.md` หลังตรวจสอบผ่านครบถ้วน

## ลบ Flow ชั้นวาง / เติมสินค้า และเปลี่ยนเป็นการนับสต็อกจากคลังสินค้า (WAREHOUSE) ที่เดียว (ตัวเลือกที่ 1)

- [x] สำรวจกฎโปรเจกต์ (`AGENTS.md`, `CLAUDE.md`), ทักษะที่เกี่ยวข้อง (`smartpos-frontend`, `smartpos-go-backend`, `tdd`, `frontend-testing`, `smartpos-go-testing`) และโค้ด/เทสต์ที่ได้รับผลกระทบใน Frontend, Go Backend และ Seed SQL
- [x] ออกแบบเกณฑ์การยอมรับและเขียน/อัปเดตเทสต์ฝั่ง Frontend และ Go Backend ให้สะท้อนพฤติกรรมใหม่ก่อนแก้โค้ด (TDD Red)
- [x] ลบเส้นทาง เมนู และหน้า UI ของชั้นวาง/เติมสินค้า (`/shelves*`, `ShelfPage.tsx`, โหมด `shelves` ใน `SupplyNav`, โหมด `shelfOnly` ใน `InventoryPage`) และปรับตัวเลือกสถานที่เก็บในฟอร์มคลัง/POS/รับคืนสินค้าให้ยึด `WAREHOUSE`
- [x] ปรับตรรกะ Go Backend (`inventory/queries.go`, `inventory/customer_returns.go`, `purchasing/queries.go`) ให้คำนวณยอดพร้อมขาย (`available`), สถานะ `POS_ELIGIBLE` และจุดสั่งซื้อจาก `WAREHOUSE` ที่เดียวโดยไม่เช็กความจุชั้นวาง
- [x] ปรับไฟล์ข้อมูลตัวอย่าง (`database/seed-sample-products.sql`, `database/seed-sample-movements.sql`) ให้จัดเก็บ ผูกเครื่องขาย POS และเคลื่อนไหวสต็อกที่คลังหลัก (`LOC-WH-MAIN`) ที่เดียว
- [ ] รันการตรวจสอบที่เกี่ยวข้อง (`vitest`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run contracts:check`, `go test`, `go vet`, `go build`, `gofmt`) และตรวจ `git diff`
  - Passed: `git diff --check`, `git diff --stat`, และ PostToolUse IDE Diagnostics (TypeScript, ESLint, Go compiler — 0 errors).
  - Blocker: การรัน `npm` / `go` / `Remove-Item` ผ่าน PowerShell และ `mcp__claude-vscode__getDiagnostics` ถูกระงับชั่วคราวโดย host auto-mode classifier (`titunnn_anti[1m] is temporarily unavailable`). คำสั่งสำหรับรันยืนยันเมื่อพร้อมใช้งาน: `npm run test --workspace @smartpos/web -- src/app/workspace-paths.test.ts src/layouts/NavigationMenu.test.tsx src/features/inventory/InventoryPage.test.tsx src/features/purchasing/purchasing-hooks.test.tsx src/i18n/messages.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run contracts:check`, และในโฟลเดอร์ `apps/api`: `go test ./...`, `go vet ./...`, `go build ./...`.
- [ ] ลบเฉพาะหัวข้องานนี้ออกจาก `TODO.md` หลังการตรวจสอบผ่านครบถ้วน
