# SESSION HANDOFF BRIEF
Handoff ID: HND-20261104-023817
Timestamp: 2026-11-04 02:38:17 +07:00 (Asia/Bangkok)
Branch/Workspace: develop | D:\!Project\smartPOS(Web_Application)

## 1. Objective And Authorization
Active Task ID: No numeric ID exists. Authoritative tracker: root TODO.md, section "Restaurant Ordering and Forecast Flow".

เปลี่ยน SmartPOS เป็นระบบร้านอาหาร: สั่งที่โต๊ะผ่าน QR, หน้าร้านออนไลน์/จัดส่ง/ชำระเงิน, หลังบ้านสูตรอาหารและวัตถุดิบ, จอคิว และพยากรณ์เมนู/วัตถุดิบวันถัดไป ผู้ใช้เลือกเปลี่ยนรอบตามเวลาปิดร้านที่ตั้งไว้ ไม่ใช่รีเซ็ตสต็อกตอนเที่ยงคืน ตัด flow จัดซื้อ/รับสินค้าจากหน้าร้านอาหาร แต่ยังเพิ่ม/ตรวจนับวัตถุดิบได้

คำขอปัจจุบันคือบันทึก handoff และหยุดเพื่อเปลี่ยน session เท่านั้น ไม่ใช่เริ่ม implementation เพิ่ม รักษางาน tracked/untracked เดิมทั้งหมด ห้ามถือว่า dirty files ทั้งหมดเป็นงานของ agent รอบล่าสุด

## 2. Completed And Verified Work
งานก่อนหน้าที่ยังอยู่ใน working tree: restaurant navigation, settings/business periods, recipes, quick-stock ledger, table metadata, paid-order queue, forecast-unavailable UI, recipe-aware POS stock consumption และ migrations 24-25 ที่ยังไม่รัน

งาน QR ล่าสุด:
- API รับ table_token, ตรวจรูปแบบ/active table/organization/branch, ผูก quote กับโต๊ะ และบันทึก table-code snapshot ใน transaction เดียวกับ order; fingerprint รวม token เพื่อรักษา replay semantics
- สร้างโต๊ะคืน qr_token เฉพาะ creation/replay; list/update ไม่คืน raw token ไม่มี rotation/recovery สำหรับ token ของโต๊ะเก่า
- หลังบ้านแสดงลิงก์เฉพาะ storefront สาขาตรงกันและมีสิทธิ์ storefront.manage พร้อม loading/error/retry, unpublished และ missing-settings states
- รักษา QR context ผ่าน catalog/cart, แสดงโต๊ะใน review/tracking และจอคิว; QR ว่าง/ซ้ำ/ผิดรูปแบบต้องไม่ fallback เป็น pickup
- ปรับ OpenAPI/contract assertions; RequiredVersion = 26 พร้อม static migration-version test ยังไม่ได้สร้างภาพ QR

Changed Files ที่ควรเริ่มอ่าน:
- apps/api/internal/modules/storefront/{domain.go,catalog.go,orders.go,dine_in_test.go}
- apps/api/internal/modules/restaurant/{domain.go,service.go}
- apps/api/internal/platform/database/{database.go,database_test.go}
- apps/web/src/features/restaurant/{StockAndTables.tsx,RestaurantPage.tsx,RestaurantPage.test.tsx}
- apps/web/src/features/storefront/{ShopCartPage.tsx,OrderDetails.tsx,StorefrontPage.test.tsx}
- apps/web/src/layouts/StorefrontLayout.tsx; apps/web/src/lib/storefront-api.ts
- packages/contracts/openapi.yaml; scripts/check-contracts.mjs
- database/migrations/000026_restaurant_order_tables.up.sql (draft, NOT executed)

Test Results: ผลต่อไปนี้รันผ่านก่อนคำขอบันทึก handoff ใน session นี้ ไม่ได้รันซ้ำระหว่าง save ผลอ้างอิงอยู่ใน tool output ของบทสนทนาและ TODO.md; ไม่มีไฟล์ raw test log ที่เก็บไว้
- apps/api: go test ./... -count=1; go vet ./... ผ่าน
- npm run test --workspace @smartpos/web: 51 files, 340 tests ผ่าน
- npm run contracts:check, npm run typecheck, npm run build ผ่าน
- npm run test:logs: 10 tests; npm run test:dev-stack: 5 tests ผ่าน
- npm run lint: 0 errors, 5 warnings (AuthProvider, OrganizationProvider, AuthPages, ShopCatalog); ไม่แก้ warnings นอกขอบเขต
- git diff --check ผ่านก่อน save; Main ทบทวน QR diff แล้ว ไม่ใช่ independent review
- RED เคยยืนยัน missing link/states, dine-in label, contract fields และ readiness 24 เทียบ migration 26 ก่อนแก้เป็น GREEN

## 3. Pending Work
ใช้ unchecked acceptance ใน TODO.md เป็น backlog เดียว ไม่คัดลอกหรือสร้าง tracker ใหม่ ลำดับถัดไปที่เหมาะสมคือกำหนดและทดสอบเลขคิวถาวรตามรอบปิดร้าน แล้วตรวจ order/payment/recipe stock แบบ integration งานภาพ QR, online payment/delivery UI ครบวงจร และ forecast จริงยังค้าง ห้ามรายงานว่าระบบทั้ง flow เสร็จแล้ว

## 4. Verified Decisions
Go เป็น public API/business authorization/transaction owner; React ไม่เรียก DB หรือ internal AI โดยตรง ใช้ persistence และ exact decimal conventions เดิม ไม่มี dependencies ใหม่หรือ external QR service

Migration 26 เพิ่ม restaurant_order_tables, tenant composite foreign keys, RLS และ runtime SELECT/INSERT; ยังไม่ได้ยืนยัน SQL/RLS จริง Readiness ต้อง schema 26 ดังนั้นฐานข้อมูล schema เก่าจะยัง not ready จนกว่าจะดำเนิน migration ที่ได้รับอนุมัติ

## 5. Known Failures And Limits
- Queue ใน restaurant/service.go ยังใช้ row_number() หลังกรอง active/paid orders เลขจึงเลื่อนเมื่อออเดอร์ออกจากคิว TODO ถูกแก้จาก verified เป็น pending แล้ว อย่าสับสนว่ามี durable daily ticket
- TestSingleStoreIsolatedDatabase ถูก SKIP เพราะไม่มี SMARTPOS_SINGLE_STORE_TEST_DSN; unit/static tests ไม่พิสูจน์ transaction, RLS, tenant isolation หรือ concurrency
- ยังไม่รัน migrations 24-26, browser E2E/visual acceptance หรือ independent review ไม่ commit/push/deploy/install และไม่เรียก paid services หรือ subagents
- ต้องอนุญาต worker/reviewer อย่างชัดเจนตาม project policy ก่อน delegation ห้ามเรียก self-review ว่า independent review
- PowerShell ในเครื่อง: exec ปกติล้มเหลว helper_unknown_error: setup refresh had errors; ใช้ native require_escalated พร้อม justification เมื่อจำเป็น ไม่ข้าม approval
- apply_patch.bat เคยเสีย multiline quoting; วิธีที่สำเร็จคือ resolve apply_patch wrapper แล้วใช้ executable ของ Codex ข้าง extension ด้วย --codex-run-as-apply-patch พร้อม patch string เดียว ไม่ใช้ string-replacement ที่เสี่ยง

## 6. Resume Boundary
Next Authorized Action: รอคำสั่งทำต่อใน session ใหม่ จากนั้นตรวจ Handoff ID/time นี้ เทียบ TODO.md, Git status/diff และโค้ดปัจจุบันก่อนทำรายการที่ยังไม่เสร็จ เริ่มจากออกแบบ acceptance ของเลขคิวถาวร ไม่ย้อนทำ QR ที่ผ่านแล้วโดยไม่มี regression evidence

Required Approval: การแก้โค้ด local ใน scope เดิมใช้ authorization เดิมได้เมื่อผู้ใช้สั่งทำต่อ; schema/data changes หรือ migration execution ต้องระบุการเปลี่ยนแปลง ผลกระทบ และ recovery/isolated target ให้ชัดและขออนุมัติตาม gate การติดตั้ง dependency, delegate review, push หรือ deploy ต้องได้รับอนุมัติที่ครอบคลุม ห้ามใช้ primary DB เป็น test target
