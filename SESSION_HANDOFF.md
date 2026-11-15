# SESSION HANDOFF BRIEF

Handoff ID: HND-20261116-020613
Timestamp: 2026-11-16T02:06:13+07:00 (Asia/Bangkok)
Branch/Workspace: feature/fix-flowsss | D:\!Project\smartPOS(Web_Application)
HEAD: a86d5d1

## 1. Objective And Authorization

Active Task ID: `TODO.md:1`, Restaurant without legacy POS / stock (2026-11-15).
Plan: `docs/superpowers/plans/2026-11-15-restaurant-without-legacy-pos.md`.

Replace the new flow with one restaurant per organization, without business
branches, hidden default branches, stock, POS carts or shifts as prerequisites.
Preserve historical retail, financial and stock records and unresolved transactions.
Local implementation, isolated task-owned DB checks and scoped independent review
are authorized. The user commits manually. Do not commit, push, deploy, create Git
branches or migrate primary/retained databases. The existing Git branch is not a
business branch. This save does not resume implementation.

## 2. Completed And Verified Work

HEAD contains internal branchless creation/setup and migration37. Uncommitted
menu work adds an explicit organization catalog registry and guarded migration38.
Menu remains optional; legacy and foreign identity reuse is rejected.

Latest slice adds organization-only storefront drafts and migration39. Verified
owners can save exact fees with revision checks and atomic audits. Source kind
is immutable. Restaurant drafts require their own profile and cannot publish,
accept orders or enter legacy catalog/publication paths. No infrastructure is
created. UI and public creation are unchanged. RequiredVersion is 39.

Changed files: `restaurant/{organization_setup.go,setup.go,setup_test.go}`;
new `restaurant/organization_menu.go`; storefront service/domain/catalog,
branchless setup/menu/settings tests, single-store tests and new
`storefront/organization_settings.go`; platform database version; migrations38/39;
setup-api test; OpenAPI; contract checker; TODO and the existing plan.
All module paths are under `apps/api/internal/modules`; web test is under
`apps/web/src/features/organization`. Preserve the entire dirty worktree.

Implementation-session evidence, not rerun for this handoff:

- PASS: in `apps/api`, `GOPROXY=off`, DB/browser variables empty,
  `go test ./... -count=1` (17 tested packages); scoped `go vet` for storefront,
  restaurant and platform/database. These package runs skip DB/browser acceptance.
- PASS: `npm run contracts:check` (18 modules/115 routes), scoped Prettier/gofmt
  and `git diff --check`.
- PASS: `RESTAURANT_SOURCE_FOCUSED=1` with baseline empty,
  `node .local/restaurant-source-db-check.mjs`: PostgreSQL17.6 tmpfs, migrations1-39,
  runtime role, 1.82s; branchless slice0.52s. Covers races, scope, exact fees,
  slug rollback, SQL/RLS/FK guards, no public visibility and legacy regressions.
  Empty down/reapply37-39, populated down refusals and owned cleanup PASS.
  Evidence: `.local/restaurant-branchless-settings-db.log`.
- Scoped independent supplied-source review: no confirmed P1/P2 in
  migration39/settings/catalog/contract. Reviewer ran no tools/tests; closed.
  No production delta after review. Later collision test passes focused rerun.

## 3. Pending Work

Use `TODO.md:1` and its organization storefront draft checkpoint at `TODO.md:184`.
Full operational organization catalog/order/payment settlement, dining/queue,
public creation/UI cutover, legacy caller retirement and whole-flow acceptance
remain open. Do not close the task or enable draft publication prematurely.

## 4. Verified Decisions

Preserve exact money, atomic replay/audit, tenant isolation and immutable history.
Paid-before-kitchen requires PAID payment, unreleased hold and refund/reconciliation
exclusions. Existing prepaid settlement still depends on POS/shift; replacement
is pending. No per-variant stock_policy exists. Legacy catalog/stock interactions
with registered menu identities still require acceptance.
Populated down39 refuses with: `Restaurant storefront data exists; use forward recovery`.

## 5. Known Failures And Limits

Full isolated DB run FAIL4.57s: directory storefronts_check; foreign invitation;
pinned invitation; reconciliation authority-revoked GET mismatch. No fresh baseline
overlay this slice. Full run precedes the final collision-only test addition.
Evidence: `.local/restaurant-branchless-settings-full.log`; cleanup PASS.
First focused attempt had an incorrect test error expectation; test corrected,
production mapping unchanged. Attempt log retained.

Earlier web732PASS/10FAIL and dev-stack6/7PASS (CSP failure) remain unresolved;
no baseline-pass claim. No fresh frontend/browser checks for this draft slice.
Whole-flow independent review and release readiness remain unmet.
Git status works despite a global-ignore permission warning. Go cache/WSL DB
checks require native escalation; do not bypass sandbox controls. No agents or
tool sessions remain running. No tests ran merely to save this handoff.

## 6. Resume Boundary

Next Authorized Action: on explicit continuation, reconcile this brief with
Git/TODO, then scope the registry-backed operational storefront/order boundary
and direct settlement dependencies before editing. Retain unpublished drafts.
Required Approval: none for settled authorized local work; native gates remain.
External actions, primary DB changes and commits require specific authorization.

---

# HISTORICAL BRIEF - NOT CURRENT

The following brief is preserved verbatim as historical evidence. Its stock
roadmap, branch, test results and next actions do not describe current acceptance.

Handoff ID: HND-20261105-004600
Timestamp: 2026-11-05 00:46:00 +07:00 (Asia/Bangkok)
Branch/Workspace: feature/fix-flow-system | D:\!Project\smartPOS(Web_Application)

## 1. Objective And Authorization

Active Task ID: Root `TODO.md`, section "Restaurant-only consolidation (2026-11-04)".
Authorized Scope:

- ปรับเปลี่ยน flow เป็นระบบร้านอาหารสมบูรณ์ (Dine-in QR, Online Delivery, Online Pickup -> Order Core -> Customer Payment -> Kitchen Queue -> Recipe/Stock Deduction -> AI Forecast).
- ผู้ใช้อนุญาตชัดเจน: "ทำต่อจากเดิมเลยครับ เเละ อนุญาตให้ใช้ independent reviewer agent" และ "[$session-handoff] บันทึกเเบบดำเนินงานถัดไป".
- ลบ/ปิดหน้าจอและฟังก์ชันค้าปลีก (Retail POS, Purchasing PO, Pricing matrix, Barcode/labels, Adjustments) โดยรักษา schema/integrity/transactions เดิมของระบบ.
- เชื่อมต่อ Customer Payment sandbox, ป้องกันครัวทำอาหารก่อนชำระเงิน (Paid-before-kitchen enforcement), รองรับค่าจัดส่ง delivery ในการปิดยอด, และเตรียมการตัดสต็อกวัตถุดิบตามสูตร.

## 2. Completed And Verified Work

Changed Files (Current Session):

- `apps/api/internal/transport/router.go`: เพิ่ม `CustomerPayments *stripe.CustomerClient` ใน `transport.Options` และส่งต่อเข้า `storefront.Service{CustomerPayments: options.CustomerPayments}`.
- `apps/api/cmd/server/main.go`: ส่งต่อ `settings.CustomerPayments` เข้า `transport.Options`.
- `apps/api/internal/modules/restaurant/queue.go`: เสริม `queueQuery` บังคับ `payment.state='PAID' AND NOT payment.stock_hold_released` พร้อมตัดออเดอร์ที่มี refund intent หรือ fulfillment review blocker.
- `apps/api/internal/modules/restaurant/queue_test.go`: เพิ่ม unit test `TestQueueQueryEnforcesPaidAndReconciliationGuards`.
- `apps/api/internal/modules/storefront/orders.go`:
  - `readOrder`: แสดง `PaymentStatus = "PAID_AT_STORE"` ทันทีเมื่อ `online_payment_attempts.state == "PAID"`.
  - `Transition`: ตรวจสอบและสกัดกั้นออเดอร์ที่มี payment attempt แต่ยังไม่ PAID ไม่ให้เข้าสู่สถานะ `PREPARING` หรือ `READY`.
- `apps/api/internal/modules/pos/prepaid.go`: แก้ไข `SettlePrepaidOnlineOrder` ให้อ่านและรวม `shipping_fee` ในการตรวจยอดรวม (`cartTotalScaled + shippingScaled == expectedTotalScaled`).
- `apps/api/internal/modules/pos/online_orders_test.go`: เพิ่ม unit test `TestPrepaidOnlineOrderDeliveryFeeMath`.
- `.gitignore`: ignore `/apps/api/.cache/`.
- `TODO.md`: บันทึกความคืบหน้าของงานและการตรวจโดย independent reviewer agent.

Test Results (Verified in this session):

- Backend Go Tests: `$env:GOCACHE="$PWD\.cache\go-build"; go test ./... -count=1` -> PASS ครบทั้ง 18 packages (0 failed).
- Backend Go Vet: `go vet ./...` -> PASS (0 warnings/errors).
- Frontend Test Suite: `npm run test` -> PASS (52 files, 355 unit/component tests passed).
- Contracts Check: `npm run contracts:check` -> PASS (18 modules, 120 unique routes valid).
- Frontend Verification: `npm run typecheck` (PASS), `npm run lint` (0 errors, 5 existing warnings in Auth/Catalog), `npm run build` (PASS).
- Git Check: `git diff --check` -> PASS (no whitespace errors).

## 3. Pending Work

อ้างอิงจาก `TODO.md`:

1. **Recipe Ingredient Stock Reservation & Deduction**:
   - เพิ่มระบบตรวจสอบและจองสต็อกวัตถุดิบในระดับสูตรอาหาร (Ingredient-level hold reservation) สำหรับ Dine-in QR และ Online Order.
   - ตัดสต็อกวัตถุดิบจริงตามสูตรอาหาร (`restaurant_recipes`) เมื่อสถานะคำสั่งซื้อเปลี่ยนเป็น `COMPLETED`.
2. **AI Demand Forecast Integration**:
   - เชื่อมต่อยอดขายจริงของเมนูอาหารกับบริการ AI เพื่อทำนายยอดขายล่วงหน้า 1 วัน และแปลงเป็นคำแนะนำการเตรียมวัตถุดิบ.
   - จัดทำหน้าจอสรุปรายงานและให้ผู้จัดการกดยืนยัน (Manager Review/Approval).
3. **End-to-End Browser Flow Verification**:
   - ตรวจสอบ E2E test cases สำหรับร้านอาหาร (สแกนโต๊ะ QR -> สั่งอาหาร -> ชำระเงิน -> คิวครัว -> ปิดยอด).

## 4. Verified Decisions

- **สถาปัตยกรรม Modular Monolith**: ไม่ลบระบบฐานข้อมูล DDL และ ORM กลางทิ้ง เพื่อรักษา ACID transactions, Row-Level Security (RLS) แยกสาขา, ทศนิยมเงิน 2 ตำแหน่ง, ทศนิยมวัตถุดิบ 3 ตำแหน่ง, และ Audit logs.
- **Paid-Before-Kitchen**: ครัว (KDS) จะมองเห็นและเริ่มทำอาหารได้เฉพาะออเดอร์ที่ได้รับการชำระเงินจริงแล้วเท่านั้น (`online_payment_attempts.state = 'PAID'`).
- **Reviewer Delegation**: ได้รับการอนุมัติใช้งาน independent reviewer agent (Copernicus) เพื่อตรวจสอบ security, idempotency และ edge cases.

## 5. Known Failures And Limits

- `SMARTPOS_SINGLE_STORE_TEST_DSN` ไม่ได้ตั้งค่าในสภาพแวดล้อมนี้: การทดสอบ integration ฐานข้อมูลแบบแยกโดเมนยังถูกข้าม (skipped) ตาม policy ความปลอดภัย ไม่แตะต้อง production/primary DB.
- Playwright E2E แบบเต็มทั้งระบบเดิมยังพบ 11 pre-existing failures บน fixtures ค้าปลีกที่ถูกปลดระวาง; ส่วน focused restaurant Playwright (15 cases) ผ่านครบถ้วน.

## 6. Resume Boundary

Next Authorized Action:

- ดำเนินการต่อในส่วน **Recipe Ingredient Stock Reservation & Deduction** (ตรวจจองสต็อกวัตถุดิบตามสูตรอาหารขณะสั่งซื้อ และตัดสต็อกวัตถุดิบเมื่อออเดอร์สำเร็จ).
  Required Approval:
- ได้รับอนุญาตให้พัฒนาต่อในขอบเขต local technical work ของ branch `feature/fix-flow-system` เรียบร้อยแล้ว. หากต้องรัน migration บนฐานข้อมูลจริง หรือ commit/push จะต้องขออนุมัติเป็นกรณีไป.

---

# HISTORICAL BRIEFS

## Handoff ID: HND-20261104-023817

Timestamp: 2026-11-04 02:38:17 +07:00 (Asia/Bangkok)
Branch/Workspace: develop | D:\!Project\smartPOS(Web_Application)

(ดูรายละเอียดใน Git history หรือ snapshot ก่อนหน้า)
