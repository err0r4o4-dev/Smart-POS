# SESSION HANDOFF BRIEF

Handoff ID: HND-20261123-214500
Timestamp: 2026-11-23T21:45:00+07:00 (Asia/Bangkok)
Branch/Workspace: feature/fix-system- | D:\!Project\smartPOS(Web_Application)
HEAD: 12ca95ae3d58da593af8bc99b471ebd863615b9f (fix-bug)

## 1. Objective And Authorization

Active Task ID: VELOPOS migration; T1.3 authority cutover remains incomplete.
Authoritative tracker: specs/velopos-migration/tasks.md; no root TODO found.
Read its pproved-requirements.md,
equirements.md and design.md siblings.
Complete the approved migration without narrowing it to accepted slices.

Goal status: ACTIVE. The user commits: never stage, commit, push or deploy.
Preserve retained data and unrelated user changes. Prior authorization covers
reversible local implementation, isolated task-owned disposable DB checks, and
scoped read-only independent review (/root/pos_customer_review). Native approvals
remain binding; primary/retained DB changes, actual Admin grants, paid/external
effects and project-data transmission require exact authorization.

## 2. Completed And Verified Work

### Accepted Slices
- Pickup (VLP-032), internal TOTP/crypto, MFA API/storage, audited Admin provisioning
  command (schema43), organization/storefront/catalog/customer authority slices accepted.
- POS Cart lifecycle mutations: CreateCart/UpdateCart typed live MFA, zero-results,
  rollback/audit. Full session79207: 1147 PASS, 0 FAIL/SKIP, 326.50s, exit0.
- POS Checkout mutation authority: PrepareCheckout, ConfirmPayment, EndCheckout,
  CompleteCheckout typed live MFA, live rechecks, savepoint SQL/domain recovery.
  Focused session66942: 261 PASS, 0 FAIL/SKIP, 54.48s, exit0.
  Full session11691: 1378 PASS, 0 FAIL/SKIP, 379.54s, exit0.
  Reviewer P3 customer classification regression reproduced RED91054, fixed,
  verified GREEN, and bounded independent review passed with no remaining findings.

### Current POS Online Import / Prepaid Authority Slice
- Production implementation:
  - pps/api/internal/modules/pos/online_orders.go: ImportOnlineOrder with
    AuthorizeMFA("online_orders.manage"), named zero return on error, writeCheck
    after every DB/helper step, inishAuthorized on create/resume, privateReadResult
    on active replay.
  - pps/api/internal/modules/pos/prepaid.go: SettlePrepaidOnlineOrder with
    AuthorizeMFA("online_orders.manage"), named zero return on error, writeCheck
    after every step, inishAuthorized on completion, privateReadResult on replay.
- Dedicated integration tests:
  - pps/api/internal/modules/storefront/pos_online_mutation_mfa_integration_test.go
  - Registered in single_store_integration_test.go and check-db.mjs.
- Verified test evidence:
  - Entry RED: 15 intended bypass failures (pos-online-entry-red-valid.log).
  - Projection RED: 5 intended private projection expiry failures (pos-online-result-red.log).
  - Focused GREEN session70622: 46 PASS, 0 FAIL/SKIP, 7.65s, exit0 (pos-online-result-green.log).
    Covers projection expiry/cancel, aborted projection, order lock wait/expiry,
    interrupted writes (pos_carts, pos_cart_items, sales, sale_items, sale_payments,
    receipts, online_orders, events, audit), tenant/membership isolation, cookie HTTP
    matrices, and concurrent replay idempotency.
  - Offline Go test/vet in apps/api: ok pos 0.131s, vet clean 0 errors (pos-online-final-go.log, pos-online-final-vet.log).
  - Root checks: contracts 18 modules/116 routes PASS, vitest 98 files/912 tests PASS,
    tsc -b clean 0 errors, dev-stack 7/7 PASS, log-format 10/10 PASS, git diff --check PASS.
  - Review package prepared: .local/velopos-identity-20261122/pos-online-review-source.md
    and pos-online-review-evidence.md.
  - Raw service.begin and inish callers in pps/api/internal/modules/pos/ reduced to 0; both dead raw helpers removed from pos/service.go. Offline Go test and vet pass cleanly.

## 3. Pending Work

1. Run Full acceptance suite (check-db.mjs full) on isolated database for the combined
   POS tree including online import/prepaid.
2. Independent review verdict for POS Online slice (/root/pos_customer_review).
3. Remove dead raw egin and inish helpers in pps/api/internal/modules/pos/service.go.
4. Proceed with remaining tracker dependencies in specs/velopos-migration/tasks.md
   towards full T1.3 authority cutover and downstream migration phases.

## 4. Verified Decisions

Google plus Email/Password; Owner/Admin TOTP and single-use recovery codes.
Sensitive actions require fresh primary authentication plus TOTP within five minutes.
Platform Admin uses audited server command with verified user ID; no actual grant.
PromptPay direct merchant food settlement; manual merchant refunds.
Preserve exact money units, tenant isolation, immutable history, idempotency,
and atomic effects. Reconcile uncertain commits without blind replay.

## 5. Known Failures And Limits

- Escalated execution approval in sandbox environment experienced reviewer timeouts;
  local workspace-only Go cache (.local/gocache) allows offline Go build/test/vet
  without requiring elevation. WSL-based check-db runs require the approved isolated runner.
- Manual privileged recovery evidence and PromptPay provider remain unresolved product inputs.
- No frontend visual/mobile readiness claim; no deployment or external network access.

## 6. Resume Boundary

Next Authorized Action: Run full isolated DB check for POS Online, obtain independent
reviewer verdict, clean up unused raw POS helpers, and continue tracker tasks.
Required Approval: None for settled authorized local work within approved scope.
External actions, primary DB changes and commits remain strictly unauthorized.

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
