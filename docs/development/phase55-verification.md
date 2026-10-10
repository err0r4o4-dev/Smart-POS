# Phase 5.5 — Loyalty & Rewards verification

วันที่ตรวจ: **2026-10-11 (Asia/Bangkok)**. **Phase 5.5 COMPLETED (Local)** หลัง mandatory local acceptance ที่ระบุด้านล่างผ่านแล้ว. **คำขอทั้งหมดและ Phase 5 overall ยัง PARTIAL**: Phase 5.6 NOT STARTED; Phase 5.7 คง PARTIAL ตาม baseline และยังไม่ทำ final QA หลัง Batch/Quality. Phase 6–7 NOT STARTED; Production Ready: NO.

## Scope และ checkpoint

- พัฒนา PostgreSQL Loyalty programs/accounts, enrollment/status, immutable ledger, earning/redemption/adjustments, snapshots, partial/full Return compensation, Exchanges/Sale reversals และ POS/Customer/Sale UI integration จริง ไม่ใช่ mocks.
- ใช้ migration **000012_loyalty.up.sql**; API readiness ต้องเป็น clean version12. ไม่แก้ migrations000001–000011.
- Rewards เป็นส่วนลด; ไม่ซ้อนโปรโมชั่น/manual discount; zero-total ใช้ NONE เดิม ไม่มี fake payment. Earn เฉพาะ committed eligible net Sales; Walk-in ยังใช้ได้.
- หนี้จากการคืน earned points ที่ใช้แล้วเก็บเป็น signed ledger; available clamped≥0 และ earnings ใหม่ชดเชยก่อน. ข้อจำกัดนโยบายอยู่ใน [Loyalty architecture](../architecture/loyalty.md).
- จุดหยุดที่ปลอดภัยของ execution นี้คือ Phase5.5 acceptance/documentation. ไม่เริ่ม migration13 หรืออ้างว่ามี Batch/FEFO/Recall/Write-off โดยยังไม่ได้ implement/verify. ต้องดำเนิน 5.6 แล้ว 5.7 ต่อก่อนครบ mission.

## Environment และความปลอดภัย

ใช้ Docker project `smartpos-auth-test` และ gateway `http://localhost:18088`. Acceptance DB คือ `smartpos_phase53_phase54_phase55_a2bea35c_35cd_4342_81a3_4c975fa36ce8`; ค่า tracker อยู่ใน `.local/phase55-database.json`. ทุก Loyalty fixture ตรวจทั้งชื่อ scratch DB และ actual API target ก่อนเขียน. ไม่มี migration ลง primary DB, deployment, volume/data deletion, Git stage/commit/reset/push หรือเปลี่ยน agent/model/sandbox policy โดย agent นี้.

Fresh-chain final checker สร้างและเก็บ DB อีกชุด `smartpos_phase53_phase54_phase55_5dfad7ed_bc50_4283_99c9_1440fe396437` โดยไม่ switch gateway. Test network ใช้172.30.55.0/28; ไม่แก้ primary `.env`. Go CGO checks ใช้ check image ที่มีอยู่; ไม่เปลี่ยน host toolchain.

ระหว่าง execution มี commits และ branding/navigation edits จากภายนอก รวม merge conflicts ชั่วคราวใน `apps/web/index.html` และ `ManagementLayout.tsx`. Agent ไม่ stage/commit หรือ resolve งานภายนอก. หลัง conflict ถูกแก้จากภายนอก จึงตรวจ frontend ใหม่และ rebuild เฉพาะ isolated web. ตัวเลข frontend/browser จึงเป็นผลของ working tree ที่ตรวจจริง รวมงานภายนอก ไม่อ้างว่าเป็น tests ที่เพิ่มโดย Loyalty ทั้งหมด.

## Evidence ที่รันจริง

| Check/command                                                                                    | ผล                         | หลักฐาน/ขอบเขต                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGO `docker compose -p smartpos-auth-test --profile checks run --no-deps --build --rm api-check` | PASSED                     | `.local/phase55-go-full.log`: gofmt clean, go vet, go test -race ./..., go build; ไม่แต่งจำนวน test cases                                                                                                                                                                                   |
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`                                 | PASSED                     | `.local/phase55-web-final.log`: **23 files/144 Vitest tests**; lint0 errors/3 existing Fast Refresh warnings; existing >500KB chunk warning                                                                                                                                                 |
| `npm run contracts:check`                                                                        | PASSED                     | canonical16 modules/106 routes, Loyalty6 templates/8 operations, auth/CSRF/idempotency/error schemas และ reward/check-out fields                                                                                                                                                            |
| `node tests/integration/loyalty-flow.mjs`                                                        | PASSED                     | `.local/phase55-loyalty-latest.log`: **86 assertions**, partial Return rounding/restoration, reservation, cancellation, concurrent redemption, replay, Walk-in and program suspension                                                                                                       |
| `node tests/integration/loyalty-safety.mjs`                                                      | PASSED                     | `.local/phase55-loyalty-safety-extended.log`: **163 assertions**, debt/future offset, zero-total/no fake payment, rule changes, failed checkout, adjustment reservations/concurrency, current-role cached replay, branch/RLS/FK/immutability, Exchanges/full Sale reversals and no-stacking |
| `node scripts/check-phase54.mjs --api-only` with explicit Phase55 scratch DB                     | PASSED per all18 suites    | `.local/phase54-regression-results.json`, per-suite `.local/phase54-*.log`, `.local/phase55-reconciliation-final.log`; wrapper initially timed out at600s, child continued and completed all18; full initial wrapper log is partial, not a claimed clean exit                               |
| Prior-phase numbered API assertions                                                              | PASSED                     | **1951** numbered assertions; Auth/Organization also passed but have no counters. Loyalty86+163 adds249; current numbered total **2200**, not2200 independent cases. Historical Phase5.4 counts are not rewritten                                                                           |
| `node scripts/check-auth.mjs --workers=1`                                                        | PASSED final rerun         | `.local/phase55-browser-full-final.log`: **37/37**, real gateway/backend; initial full run36/37 and focused rerun3/3 retained                                                                                                                                                               |
| `node scripts/check-phase55-migrations.mjs` without `--start`                                    | PASSED                     | `.local/phase55-migrations-final.log`: fresh1–12, clean tracker at each version, no-change rerun, FORCE RLS/runtime grants, **9 rollback-only SQL suites**                                                                                                                                  |
| Pricing/Inventory/payment, Customer and Loyalty read-only reconciliation                         | PASSED                     | `.local/phase55-reconciliation-final.log`: **8+3+6=17 checks, zero violations**; SQL raises on mismatches, not just printing counts                                                                                                                                                         |
| Responsive and keyboard smoke                                                                    | PASSED within stated scope | Loyalty320/375/768/1280/1920, no horizontal overflow; real program/enrollment/adjustment/POS redemption/history, labeled controls and Tab focus; no full accessibility certification                                                                                                        |

Verification uses no real bank/payment-provider acknowledgement. CASH/manual evidence is synthetic operator confirmation within the existing local engine.

## Findings/fixes และ failed runs

1. Contract checker Loyalty block was before `api`/`loyaltyPaths` initialization: moved after initialization without deleting existing assertions. Response schema no longer inherits strict input `additionalProperties:false` through incompatible allOf; quote's optional `loyalty_points` is documented/checked.
2. Redemption SQL initially compared text/uuid without casts: explicit casts fixed the DB boundary; original failed log retained.
3. POS revalidation shared the original cart-item slice; repricing overwrote reward allocation and failed settlement consistency. Defensive slice copy keeps frozen discount allocation unchanged; failed attempts retained.
4. Quote initially returned raw Loyalty domain errors as503: existing POS error mapping now produces typed400/403/404/409 as appropriate.
5. New safety-test expectations initially used200 for a completed Return with a new key,200 for confirmation after suspension, invalid `CASH_COLLECT`, and400 for no-stacking. Actual contracts enforce409/409/CASH/409. Corrected fixture expectations, not application guards; failing logs first/second/third/fourth retained. Separate cashier terminal/shift fixed ownership precondition for the demotion fixture.
6. New E2E initially targeted a nonexistent program heading and exact nested-label select text; corrected to actual text/combobox/value locators. Full browser later exposed an outdated workspace fixture that clicked a link in a collapsed group; added explicit user-equivalent expansion and asserted `aria-expanded` without removing any original assertion. Final full37/37 passed.
7. First migration+stack attempt hit proxy-subnet overlap. Only the test checker network was changed; primary network unchanged. Initial API/SQL failures and typecheck failures from implementation remain in `.local/phase55-*.log` alongside successful reruns.

Actual runtime denial tests cover ledger UPDATE/DELETE/TRUNCATE, cross-tenant enrollment/FK/read, unauthorized branch history, program administration by Cashier, adjustment replay after demotion and checkout cached replay after loss of POS permission. This is scoped local acceptance, not the final Phase5.7 security review or a penetration/compliance audit.

## Ledger/financial reconciliation

Existing pricing reconciliation now includes the exact frozen Loyalty discount in addition to promotion and approval amounts; all prior stock/gross/net/consideration/NONE/usage/snapshot/deduction checks remain. Customer linkage checks remain unchanged.

Loyalty checks assert: reward Sale has the exact REDEEM reference/points; EARN matches historical eligible total/rules; cumulative compensation never exceeds original postings; Return references belong to committed original returns; full cumulative Return restores exact original points; and unique posting keys are not duplicated. Ledger-signed debt is intentionally not rejected as a reconciliation mismatch.

## Changed implementation paths

- `database/migrations/000012_loyalty.up.sql`; schema readiness in `apps/api/internal/platform/database/database.go`.
- `apps/api/internal/modules/loyalty/{domain,service,http,redemption,posting}.go`, domain tests; `organization/loyalty_policy.go`/policy and transport router.
- Existing POS checkout/domain/HTTP/pricing/Sales/service and Returns posting; Pricing reward domain/application and tests. Existing financial/Inventory engines retained.
- `apps/web/src/features/loyalty/*`, `lib/loyalty-api.ts`, PricingQuote types, POS checkout, Customer/Sale detail links, router/routes/navigation.
- `packages/contracts/openapi.yaml`, `scripts/check-contracts.mjs`, `scripts/check-phase55-migrations.mjs`, `package.json` verification shortcut.
- `tests/integration/loyalty{,-flow,-safety,-reconciliation}.*`, `pricing-reconciliation.sql`, schema-version assertions in existing SQL suites, `tests/e2e/loyalty.spec.ts`, workspace grouped-navigation fixture.
- README/TODO, architecture/modules/routes/roadmap/Customers/Loyalty, database/security and overall verification documentation. Historical phase reports preserved. Branding/navigation commits from outside this agent are not attributed to this task.

## Exact next work and production gates

1. Phase5.6: inspect every existing Inventory posting path before forward-only `000013_batch_quality`; implement explicit legacy untracked stock and `aggregate=tracked+untracked` conservation, real lot receiving/transfers/shelves/POS/Returns, sellability and verified selection, write-offs/recalls and four planned routes. Do not invent provenance.
2. Pass every Batch/Quality gate, including Sale vs Write-off/Recall races, branch/RLS, FEFO/unknown-stock policies, quantity reconciliation and real backend E2E; create `phase56-verification.md` from actual evidence.
3. Only then execute Phase5.7 complete Supplier-to-Recall lifecycle and final security/resilience/manual reconciliation review; preserve all old and new regressions and produce `phase57-verification.md`.
4. Production remains NO: dedicated runtime LOGIN/secrets/TLS, retention/erasure/reward-accounting policy, backups/restoration/rollout, load/concurrency assessment, physical lot selection/scanners/printers, real payment integration and full accessibility review are separate operational gates.
