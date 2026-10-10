# Phase5.2 — Exchanges & Voids: Final Local Acceptance

วันที่ตรวจ **2026-10-10, Asia/Bangkok**; รายงาน working tree ที่ยังไม่ commit ไม่ใช่ production certification

## 1. ผลตัดสินและขอบเขต

**Phase5.2 COMPLETED (Local)** ตาม mandatory scoped acceptance gates ที่รันจริง ไม่ใช่จากการมีไฟล์หรือหน้า placeholder เพียงอย่างเดียว

| Phase                          | สถานะ                                                                |
| ------------------------------ | -------------------------------------------------------------------- |
| 0 / 1A / 1B / 1C / 2 / 3 / 4   | COMPLETED (Local)                                                    |
| 5.1 Returns & Refunds          | COMPLETED (Local); regression ผ่าน                                   |
| 5.2 Exchanges & Voids          | **COMPLETED (Local)**                                                |
| 5.3 Pricing & Promotions       | NOT STARTED                                                          |
| 5.4 Customers                  | NOT STARTED                                                          |
| 5.5 Loyalty & Rewards          | NOT STARTED                                                          |
| 5.6 Batch, Expiry & Quality    | NOT STARTED                                                          |
| 5.7 Integration, Security & QA | PARTIAL; gates สำหรับ subphases ที่ยังไม่มี implementation ยังไม่รัน |
| Phase5 overall                 | **PARTIAL**                                                          |
| Phase6                         | NOT STARTED / NOT READY                                              |

รับช่วง implementation หลัง baseline HEAD `3de0ae6` โดยไม่ reset/rewrite Phase0–5.1 คง canonical **16 modules / 106 routes** และเพิ่มสถานะ operational ให้ `/pos/exchanges`, `/sales/voids` ที่มีอยู่ใน route inventory เดิม ไม่มี engine, DB หรือ RBAC ใหม่ ไม่เริ่ม5.3+ ไม่ commit/stage/branch/push/deploy ไม่ลบฐานข้อมูลหรือ volumes และไม่เข้าถึง/migrate persistent primary

รายงานนี้ supersede สถานะ5.2 deferred ใน [Phase5.1](phase5-verification.md) โดยเก็บรายงาน/จำนวนเดิมเป็น historical evidence

## 2. Architecture และ implementation จริง

- Existing `returns` module owns discriminated EXCHANGE/REVERSAL documents and immutable settlement events; Organization owns membership/RBAC/branch transactions; POS owns replacement Sale/payment/receipt/shift; Inventory owns stock posting ทั้งหมด
- Reuse historical cumulative Return allocation และ inspected disposition, existing POS `settle`, refund-settlement/cash disbursement และ Inventory posting ไม่มี balance update ทางลัด
- Schema9: `sale_adjustments`, `adjustment_settlement_events`; checkout/payment เพิ่ม explicit `credit_amount` และ internal recorded `EXCHANGE_CREDIT` แต่ normal checkout input/selector ไม่เปิด method นี้
- Lifecycle `DRAFT → PENDING_APPROVAL → APPROVED → AWAITING_SETTLEMENT → COMPLETED`; reject/cancel ก่อน acknowledged funds; stale revision/changed payload ต้อง conflict
- Historical credit ใช้ paid line consideration เดิม ไม่ใช้ catalog price ปัจจุบัน Replacement ใช้ราคา server-authoritative และ revalidate snapshot เมื่อ complete; money เป็น decimal strings/exact integers ไม่ใช้ float คำนวณเงิน
- `net_difference = replacement_total − return_credit`; equal uses NONE, positive explicit collection, negative authorized refund Applied credit=min(credit,gross); `payment.amount + credit_amount = grand_total` ไม่มีการนับ credit เป็น external cash/bank payment
- Atomic posting ครอบคลุม Return allocation/SALE_RETURN, replacement Sale/receipt/payment/stock deduction, linked refund/cash totals, document status, audit และ operation result โดยรักษา organization serialization/managed-shelf/no-negative-stock
- ถ้า acknowledged nonzero funds แล้ว posting conflict: SAVEPOINT rollback business effects เก็บ acknowledgement/RECONCILIATION_REQUIRED ใหม่ทั้ง transaction; original key replay failure result Recovery refresh revision ใช้ new completion key **ไม่รับ/คืนเงินซ้ำ** Zero-difference posting failure rollback ทั้ง command
- Sale reversal เป็น compensating full Return/refund ไม่ลบ/แก้ original Sale/items/payments/receipt และไม่เปิด closed shift ใช้ conservative no-prior-completed-return/adjustment policy ไม่รองรับ residual partial-sale reversal Existing uncommitted checkout cancellation ยังแยกจาก completed-sale reversal
- TH/EN Golden Amber Glass UI: server quote, draft editing, approval queue, explicit acknowledgement, recovery, history/linkage/Inventory evidence/audit/committed print Context-bound user/org/branch cache และ hide detail เมื่อ branch mismatch

รายละเอียด: [business architecture](../architecture/business-operations.md), [schema](../database/exchanges-voids.md), [exchange](../business-flows/product-exchanges.md), [settlement](../business-flows/exchange-settlement.md), [reversal](../business-flows/sale-reversals.md)

## 3. Environment จริง

| รายการ                  | ผลตรวจ                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Host                    | Windows/PowerShell; Node24.21.0; Go1.27.2 windows/amd64; host CGO_ENABLED=0 ไม่เปลี่ยน configuration       |
| Docker Engine / Compose | 29.8.2 / v5.5.1; daemon ทำงานจริง ไม่ได้สมมติว่า available                                                 |
| Isolated project        | `smartpos-auth-test`; actual gateway `http://localhost:18088`; API/web/Caddy/PostgreSQL/AI/Mailpit healthy |
| PostgreSQL / Caddy      | 17.11 / v2.10.2; Compose config และ Caddy validate ผ่าน                                                    |
| Go check image          | Go1.26.9 linux/amd64, GCC15.2.0, CGO_ENABLED=1; race ผ่านผ่าน existing api-check image                     |
| Browser                 | Existing Playwright dependencies/Chromium ใช้งานจริง; 21 tests ผ่านผ่าน gateway/backend/PostgreSQL         |
| Build                   | API/web Docker builds ผ่าน; frontend production build ผ่าน; ไม่มี deployment                               |

ใช้ project-qualified commands; SQL/HTTP test fixtures enforce isolated project/origin ใช้ synthetic tenants/users ไม่ใช้ primary data Auth/org tests ที่จำลอง SMTP outage รันตามลำดับและ restore Mailpit ไม่รันคู่กัน

## 4. Migration และ database acceptance

Command: `node scripts/check-phase52-migrations.mjs` — **PASS**

Latest retained scratch: `smartpos_phase52_acceptance_20261010_09667c15`; earlier final verified scratch `smartpos_phase52_acceptance_20261010_db535b5a` เก็บไว้ ไม่มี drop/delete

1. Scratch เริ่ม zero public tables; official golang-migrate apply000001→000009 ทีละ migration; tracker1|f…9|f
2. Rerun หลัง9: `no change`; readiness ใช้ exact clean9
3. **7 rollback-only SQL suites PASS**: foundation, identity, organization, catalog, inventory, returns, adjustments
4. FORCE RLS/runtime grants/composite tenant references/immutable events/deferred consistency ตรวจผ่าน runtime role จริง ไม่ใช้ superuser result แทน RLS
5. Existing isolated smartpos tracker/Sale/user counts ไม่เปลี่ยนระหว่าง fresh-chain verification; primary ไม่ถูกเข้าถึงและไม่มี volume/data deletion
6. Migration1–8 และ managed-shelf `inventory/customer_returns.go` ไม่แก้ไข

Transparency: ระหว่าง development isolated smartpos ได้ apply9 ก่อน final acknowledgement/consistency guard enhancement จึง transactionally synchronize **เฉพาะ exact new constraint และ CREATE OR REPLACE adjustment_consistency() จาก migration9** ใน test DB หลัง fresh validation ไม่ใช่การอ้างว่า no-change migration rerun apply SQL ที่แก้แล้ว Primary ไม่ถูก migrate และ final fresh chain1–9 ผ่านครบหลัง enhancement

Latest isolated read-only reconciliation หลัง suites: tracker **9|f**, global Stock Ledger/Balance mismatches **0**, Sale payment external+credit consideration mismatches **0**

Final read-only reconciliationหลังpost-security fullbrowser: schema9|f, ledger0, payment0, shift formula0, cash_sales-vs-external-CASH-payments0, cash_refunds-vs-disbursements0 mismatches;หลักฐาน `.local/phase52-final-reconciliation.json`

## 5. Integration และ security acceptance

| Suite / command                                                                                   | ผลจริง                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `node tests/integration/adjustments-flow.mjs`                                                     | **163 assertions PASS**                                              |
| `node tests/integration/adjustments-safety.mjs`                                                   | **135 assertions PASS**                                              |
| `node tests/integration/adjustments-boundaries.mjs`                                               | latest **86 assertions PASS**                                        |
| Phase5.2 numbered total                                                                           | **384 assertions PASS**; assertions ไม่ใช่384 independent test cases |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm auth-integration-check` | runtime SQL/constraints/grants/RLS checks **PASS**, exit0            |

Coverage: equal/positive/negative/multi-item and weighted exchanges; cash/manual methods; authoritative pricing/historical cumulative rounding; original snapshot immutability; durable links/audit; stale revisions/idempotency/changed payload; duplicate/concurrent exchange/reversal; exchange-vs-normal-Return/POS; acknowledged rollback/recovery/refund-once; cash reservations/shift close races; managed shelf capacity/inactive/unassigned rejection; ledger/payment/cash reconciliation

Security findings/fixes verified:

- Final scoped reviewพบ Cashierที่เป็นcreator สามารถcomplete negative manual refundที่Manager acknowledgedแล้วได้; reproducerได้200แทน403 จึงเพิ่ม server conditional authority checkก่อนBeginOperation/replay และซ่อนcompletionในUIตามcurrent role ทดสอบCashier403/no posting, promotionเป็นManagercompleteสำเร็จ, demotionกลับCashier exact-key replay403; boundariesเพิ่มจาก77เป็น86 assertions PASS
- Recheck membership/branch/permission **before replay cache**; cross-tenant concealment404, cross-branch/RBAC denial403; suspension/demotion/revocation ไม่ replay financial results
- Cashier legitimate positive exchange requires approval and own shift; another actor's shift/negative refund/reversal completion denied ไม่ bypass security เพื่อให้ผ่าน
- Existing CSRF/Origin, UUID command key, bounded strict JSON/list inputs retained; transition actionsนอกจาก confirm-settlement ปฏิเสธ financial payload fields
- Migration CHECK/NULL loophole ถูกปิดด้วย explicit acknowledgement state/evidence constraint; deferred actual replacement Sale items match approved quantity/price/total snapshot
- Runtime missing/mismatched context yields zero rows; events/completed history no rewrite/delete; Stock Balancesไม่มี direct runtime write grant
- Normal POS UI/inputไม่เปิด internal EXCHANGE_CREDIT; historical Sale/receipt แสดง credit vs external funds ได้ ช่วง frontend switching ไม่มี stale cross-org/branch document
- Managed-shelf Phase5.1 protection preserved; simultaneous return/exchange ไม่ overfill และ failed postingไม่มี orphan stock/Sale/refund/cash effects

ไม่พบ unresolved implementation/security regression ในขอบเขตที่ทดสอบ ไม่ใช่การรับรองว่าไม่มีช่องโหว่ทั้งหมดหรือ penetration test

## 6. Regression / unit / build gates

| Check                                                                                        | ผล                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / organization real HTTP suites                                                         | PASS; scriptsไม่รายงานจำนวน assertions จึงไม่นับเพิ่ม                                                                                                         |
| Catalog                                                                                      | 116 assertions PASS                                                                                                                                           |
| Inventory                                                                                    | 135 assertions PASS                                                                                                                                           |
| POS flow/safety                                                                              | 132+64=196 assertions PASS                                                                                                                                    |
| Purchasing/shelves flow/safety                                                               | 175+125=300 assertions PASS                                                                                                                                   |
| Returns flow/safety/shelves                                                                  | 111+96+42=249 assertions PASS                                                                                                                                 |
| Numbered regression total                                                                    | **996**; รวมPhase5.2=**1380** assertions                                                                                                                      |
| `npm run test`                                                                               | **94/94 frontend tests**,18 files; contracts PASS                                                                                                             |
| `npm run typecheck`                                                                          | PASS                                                                                                                                                          |
| `npm run lint`                                                                               | 0 errors;3 existing Fast Refresh warnings                                                                                                                     |
| `npm run build`                                                                              | PASS; existing >500KB chunk warningยังอยู่ ไม่ suppress                                                                                                       |
| `npm run contracts:check`                                                                    | PASS; canonical16 modules/106 routes;18 new adjustment path templates/22 operations                                                                           |
| `docker compose -p smartpos-auth-test --profile checks run --build --rm api-check`           | gofmt/vet/**go test -race ./...**/build PASS,exit0                                                                                                            |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm ai-check`          | lint/format/import and**7/7 pytest** PASS,exit0;1 existing Starlette/httpx warning                                                                            |
| `docker compose -p smartpos-auth-test --profile checks run --no-deps --rm integration-check` | foundation schema/RLS,service communication/readiness,Caddy routing PASS,exit0; internal AI route404เป็น expected denial                                      |
| Compose / Caddy                                                                              | `docker compose -p smartpos-auth-test config --quiet`; `docker compose -p smartpos-auth-test exec -T caddy caddy validate --config /etc/caddy/Caddyfile` PASS |

Go race ใช้ suitable CGO image ไม่ต้องติดตั้ง compiler หรือเปลี่ยน CGO host Raceของ Go testsไม่ใช่หลักฐาน concurrency DB เพียงอย่างเดียว; real PostgreSQL/HTTP race scenariosข้างต้นเป็นอีก gateหนึ่ง

Actual `go test -race -json ./...` หลังfinalfix: **39 top-level Go tests**, **112 passed test/subtest events**, **9 tested packages**, exit0;ไม่เรียก112 eventsเป็น112 independent top-level tests หลักฐาน `.local/phase52-go-race-counts.json` / `phase52-go-race-tests.jsonl`

## 7. Playwright และ visual acceptance

Latest post-security command: `node scripts/check-auth.mjs --workers=1 --output=.local/phase52-post-security-e2e` — **21/21 PASS**, **3.3 minutes**. Earlier final run21/21 in3.2m is preserved separately.

มี **2 new grouped exchange/reversal tests +19 existing regressions** ไม่เรียก labeled E2E scenariosเป็น30 executed tests ใช้ actual gateway/backend/PostgreSQL ไม่มี mocked adjustment API

Verified: lookup/quote/edit/approval/settlementทุก money direction, multi-item, real insufficient-stock rejection, acknowledged failure/recovery, replay, original/Return/replacement links and receipt credit, duplicate/prior-return reversal denial, uncommitted checkout cancellation, register/ledger/snapshot assertions, denied tenant/Cashier flows, TH/EN and organization/branch switching

Responsive checksผ่าน320/375/640/768/1024/1440/1920px; completed Exchange/Reversal screenshots320/768/1440 และ print media inspected: ไม่มี horizontal clipping/obstructed actions ที่พบในภาพ มี wrappingของเลขเอกสาร/audit บนจอเล็กตามการออกแบบ Print failureและ reprintไม่ repost funds/stock ไม่อ้าง physical printer/tax invoice compliance/full accessibility audit

หลักฐานล่าสุด `.local/phase52-post-security-e2e/` และ `.local/phase52-post-security-e2e.stdout.log` พร้อมหลักฐานก่อนfix `.local/phase52-final-e2e/` เก็บ local/ignored ไม่ commit raw browser tracesที่อาจมี session-sensitive data

## 8. Performance, reliability และประวัติ failed attempts

`node tests/integration/adjustments-performance.mjs`: **PASS**,3 real synthetic HTTP iterations ไม่ใช่ production load certification

| Operation                                     | Observed min–max ms |
| --------------------------------------------- | ------------------- |
| Original Sale lookup                          | 6.31–7.25           |
| Exchange quote                                | 9.73–10.26          |
| Create                                        | 18.09–21.25         |
| Submit                                        | 12.01–12.77         |
| Approve                                       | 11.98–13.48         |
| Acknowledge                                   | 12.47–13.03         |
| Complete incl.Return/POS/Inventory/cash/audit | 33.16–34.99         |

Organization serializationยังเปิด; concurrent correctness/shift contention verifiedด้วยintegration assertions ไม่มี contention percentile/throughput SLA หรือ large-scale/load benchmark

Preserve failures,ไม่แก้ log/JSONให้ดูผ่าน:

- Earlier sequential `scripts/check-phase52.mjs` runเก็บ `.local/phase52-regression-results.json` มี Returns safetyและadjustments boundaries **FAILED**; component suitesอื่นและbrowser20/20ผ่าน นี่ไม่ใช่ green full-run artifact
- Returns safety comparisonเดิมรวม new related-document projectionsที่ย่อมเพิ่มตาม Returns/Exchanges; แยกเฉพาะ `returns`/`adjustments` ออกจาก immutable original snapshot comparison และเพิ่ม linkage assertion ไม่ลบการตรวจ Sale/payment/receipt/movement fields Final separate rerun**96 PASS**
- Cashier boundaryใช้ invented singular completion URL;แก้เป็น existing `/pos/checkouts/{id}/complete` Final separate rerun**77 PASS**;ไม่ลด backend authorization
- Earlier browser attemptsติด exact wrapped label locator;แก้ให้ตรง accessible labelจริงและ bounded default timeout Latest focused main workflowและfinal21/21ผ่าน Failed outputsเก็บไว้ ไม่ถูกนับเป็นPASS
- PowerShell combined commandเคยคืนexit1จาก native stderr/TeeObject wrapperแม้checksผ่าน;rerun Dockerchecksด้วย spawnSyncเก็บ actual process exit0สำหรับSQL/smoke/AI/Go raceชัดเจน

Final acceptanceอาศัย recorded passing component reruns+latest full21-test browser suite ไม่อ้างว่า initial sequential-run JSONกลายเป็นPASS และไม่ได้รัน entire orchestratorใหม่อีกครั้งหลัง reruns

## 9. Evidence paths และข้อจำกัด

Local logs: `.local/phase52-regression.stdout.log`, `phase52-regression-results.json`, `phase52-final-returns-safety.log`, `phase52-final-boundaries.log`, `phase52-final-migrations.log`, `phase52-final-sql.log`, `phase52-final-smoke.log`, `phase52-final-go-race.log`, `phase52-final-ai.log`, `phase52-final-unit.log`, `phase52-final-typecheck.log`, `phase52-final-lint.log`, `phase52-final-web-build.log`, `phase52-final-environment.log`, `phase52-performance.log`, `phase52-final-e2e.stdout.log` ภายใต้ `.local/`;ไม่ใช่ published/staged artifacts

Final post-security reruns: `phase52-negative-complete-repro.log` retained FAILED reproducer, `phase52-security-rebuild.log`, `phase52-final-flow.log`163 PASS, `phase52-final-safety.log`135 PASS, `phase52-final-boundaries.log`86 PASS, updated Go race exit0, frontend94/typecheck/lint/build/contracts PASS และ `phase52-post-security-e2e.stdout.log`21/21 PASSใน3.3m ไม่ rewrite failed evidence

Remaining limitations:

- Manual payment/refund acknowledgementเป็น operator evidenceไม่ใช่ bank/gateway validation;ไม่ auto retry funds ไม่ automatic payout
- Full-sale reversal conservative only;ไม่รองรับ residual partial-sale reversal หรือ acknowledgement cancellationที่ fundsมีข้อพิพาท ต้อง investigation ไม่ลบหลักฐาน
- Cash postingต้อง actor-owned current OPEN shift;unavailable-owner reassignmentยังไม่มี Original closed shiftไม่แก้
- ไม่มี discounts/separate tax/price lists/promotions/customer/loyalty/batch/FEFO/expiry/recall automation หรือ Phase6 AI inference
- Browser printเท่านั้น; physical printers/scanners, legal tax approval, full accessibility/penetration and production capacity/load/rollout checks **NOT RUN**
- Existing frontend3 lint warnings/bundle warningและAI1 dependency deprecation warningยังอยู่ ไม่แก้นอกscope
- Retained synthetic tenants/scratch DBsมีข้อมูลทดสอบ;ไม่มีcleanup destructiveโดยอัตโนมัติ Deployment/primary schema rolloutต้อง separate explicit approval

## 10. Readiness สำหรับ Phase5.3

เริ่มการวางแผน Phase5.3ได้จาก locally accepted5.2 แต่ **ยังไม่เริ่ม implementation** ต้องออกแบบ persisted historical discount/tax allocationsและ promotion precedence/approvalพร้อม additive API/migration,credit-aware reportingและ Return/Exchange regressionก่อนเพิ่มความสามารถ ไม่ใช้current passing testsยืนยันsubphaseที่ยังไม่มีcode Phase5 overallยังPARTIALและPhase6ยังNOT READY

## 11. Changed paths

Backend/contracts: forward-only migration9, Returns adjustments domain/HTTP/queries/create/posting/tests, POS credit-aware settlement/history/registers, Organization fixed-grant policy/tests and readiness9; frontend typed adjustment API/tests, builder/pages/TH-EN copy, router/navigation, related Sale links/receipt-credit regression/context hooks/style; verification scripts and actual integration/E2E/rollback SQL; architecture/schema/security/business-flow/current evidence documentation

Final inspection: **43 modified +29 created paths**; `npm run format:check`, `git diff --check`, changed MJS syntaxและ115 local Markdown linksผ่าน Protected migrations1–8/canonicalroutes/Shelf-returnfix unchanged;ไม่มีstaged changes; selected private-key/token patternsในchanged source0 matchesไม่ใช่exhaustive secret audit Primary DB/volumes preserved;ไม่commit/push/deploy

Exact path inventory relative to the repository at final handoff:

### Created (29)

- `apps/api/internal/modules/organization/adjustments_policy.go`
- `apps/api/internal/modules/organization/adjustments_policy_test.go`
- `apps/api/internal/modules/pos/exchanges.go`
- `apps/api/internal/modules/returns/adjustments_create.go`
- `apps/api/internal/modules/returns/adjustments_domain.go`
- `apps/api/internal/modules/returns/adjustments_domain_test.go`
- `apps/api/internal/modules/returns/adjustments_http.go`
- `apps/api/internal/modules/returns/adjustments_posting.go`
- `apps/api/internal/modules/returns/adjustments_queries.go`
- `apps/web/src/features/returns/AdjustmentBuilder.tsx`
- `apps/web/src/features/returns/AdjustmentsPage.tsx`
- `apps/web/src/features/returns/adjustments-copy.ts`
- `apps/web/src/lib/adjustments-api.test.ts`
- `apps/web/src/lib/adjustments-api.ts`
- `database/migrations/000009_exchanges_voids.up.sql`
- `docs/business-flows/exchange-settlement.md`
- `docs/business-flows/product-exchanges.md`
- `docs/business-flows/sale-reversals.md`
- `docs/database/exchanges-voids.md`
- `docs/development/phase52-verification.md`
- `scripts/check-phase52-migrations.mjs`
- `scripts/check-phase52.mjs`
- `tests/e2e/exchanges.spec.ts`
- `tests/integration/adjustments-boundaries.mjs`
- `tests/integration/adjustments-fixtures.mjs`
- `tests/integration/adjustments-flow.mjs`
- `tests/integration/adjustments-performance.mjs`
- `tests/integration/adjustments-safety.mjs`
- `tests/integration/adjustments.sql`

### Modified (43)

- `README.md`
- `TODO.md`
- `apps/api/internal/modules/organization/policy.go`
- `apps/api/internal/modules/pos/registers.go`
- `apps/api/internal/modules/pos/sales.go`
- `apps/api/internal/modules/returns/http.go`
- `apps/api/internal/modules/returns/posting.go`
- `apps/api/internal/modules/returns/refunds.go`
- `apps/api/internal/modules/returns/service.go`
- `apps/api/internal/platform/database/database.go`
- `apps/web/src/app/router.tsx`
- `apps/web/src/app/routes.ts`
- `apps/web/src/features/pos/POSPages.tsx`
- `apps/web/src/features/pos/Receipt.test.tsx`
- `apps/web/src/features/pos/SalesPages.tsx`
- `apps/web/src/features/returns/ReturnsPage.tsx`
- `apps/web/src/features/returns/returns-hooks.test.tsx`
- `apps/web/src/features/returns/returns-hooks.ts`
- `apps/web/src/lib/pos-api.ts`
- `apps/web/src/lib/returns-api.ts`
- `apps/web/src/styles/returns.css`
- `docs/architecture/business-operations.md`
- `docs/architecture/modules.md`
- `docs/architecture/overview.md`
- `docs/architecture/pos.md`
- `docs/architecture/roadmap.md`
- `docs/architecture/routes.md`
- `docs/database/overview.md`
- `docs/development/phase5-verification.md`
- `docs/development/verification.md`
- `docs/security/security-model.md`
- `package.json`
- `packages/contracts/openapi.yaml`
- `scripts/check-auth.mjs`
- `scripts/check-contracts.mjs`
- `tests/integration/auth-check.sh`
- `tests/integration/catalog.sql`
- `tests/integration/foundation.sql`
- `tests/integration/identity.sql`
- `tests/integration/inventory.sql`
- `tests/integration/organization.sql`
- `tests/integration/returns-safety.mjs`
- `tests/integration/returns.sql`
