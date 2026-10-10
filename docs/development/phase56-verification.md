# Phase 5.6 — Batch, Expiry & Quality acceptance

วันที่ 2026-10-11: **COMPLETED (Local)**. Phase5.5 ผ่าน gate ก่อนเริ่มงานนี้; Phase5 overall ยัง **PARTIAL**, Phase5.7 ต้องตรวจ final lifecycle/security/QA. Production Ready **NO**; Phase6–7 NOT STARTED.

## Implementation

- Forward-only `000013_batch_quality.up.sql`, readiness exact clean13. ไม่แก้ migrations1–11, migrate primary DB หรือลบ DB/volume.
- Inventory ledger เดิม authoritative; quality balances เป็น transactional tracked/untracked projection พร้อม aggregate=tracked+untracked, ไม่สร้าง stock/payment engine ใหม่.
- Lot records, immutable metadata, audited status history, FEFO recommendation, Bangkok expiry boundary, quarantine, variant/lot recalls และ approved/rejected/posted write-offs.
- Batch identity/verification ผ่าน Receiving/Supplier Return, adjustments/transfers, shelf replenishment, POS, Returns/Exchanges/Reversals. Receipt/Sale lot matching บังคับทั้ง service และ trigger.
- สี่ routes จริง `/inventory/batches`, `/inventory/expiry`, `/inventory/write-offs`, `/inventory/recalls`; permission-aware TH/EN, explicit picking, history และ responsive UI.
- Changed paths: `apps/api/internal/modules/inventory/{quality,quality_http,quality_test}.go`, existing Inventory/POS/Purchasing/Returns services/domains, organization quality policy, schema readiness; `apps/web/src/features/quality/*`, `lib/quality-api.ts`, existing operational UI/API types; OpenAPI/contracts, migration checker and Quality API/SQL/browser tests. External branding/navigation changes preserved, not attributed to this implementation.

## Actual local evidence

Isolated Compose project `smartpos-auth-test`, gateway18088/API18080/web15173/PostgreSQL15432/Mailpit18025. Database in `.local/phase56-database.json`: `smartpos_phase53_phase54_phase55_phase56_41778f6a_886f_4a60_929a_1405a3dd01e2`. Synthetic data only.

| Actual check / command | Result | Evidence / boundary |
| --- | --- | --- |
| `node scripts/check-phase56-migrations.mjs` | PASS | `.local/phase56-migrations-current.log`:fresh1–13, clean tracker/rerun, runtime grants/FORCE RLS,10 rollback-only SQL suites |
| Existing CGO-enabled api-check:gofmt, `go vet ./...`, `go test -race ./...`, `go build ./cmd/api` | PASS | `.local/phase56-go-final.log`; not production load evidence |
| `npm test` | PASS | `.local/phase56-frontend-final.log`:23 files/120 frontend tests plus contracts; current working-tree counts |
| `npm run typecheck`, `npm run lint`, `npm run build` | PASS | `.local/phase56-*-final.log`;0 ESLint errors/3 existing Fast Refresh warnings; existing Vite chunk warning |
| 22 API suites via `node tests/integration/<suite>.mjs` | PASS | `.local/phase56-<suite>-final.log`:auth, organization, catalog, inventory, POS+safety, purchasing+safety, returns+safety+shelves, adjustments+safety+boundaries, pricing+safety, customers+safety, loyalty+safety, quality+safety |
| Quality flow / safety | PASS | 110+175 assertions; receiving/transfers/sales/returns, FEFO/untracked, expired/quarantined/recalled denial, write-offs,3 Sale/WriteOff races and3 Sale/Recall races, tenant/branch/FK/RLS, current RBAC replay, tracked shelf task/conservation |
| Pricing8 + Customers3 + Loyalty6 + Quality7 reconciliation | PASS | 24 read-only fail-on-mismatch checks, zero violations; `.local/phase56-*-reconciliation-final.log` |
| `node scripts/check-auth.mjs tests/e2e/inventory.spec.ts --workers=2` | PASS rerun | `.local/phase56-inventory-browser-rerun.log` after restoring exact Movement cell label |
| `node scripts/check-auth.mjs --workers=2` | PASS rerun | `.local/phase56-browser-full-rerun.log`:37/37, real Caddy/backend |
| Compose config / `git diff --check` | PASS | checked during implementation; final Phase5.7 repeats |

Failed evidence preserved: initial Quality browser fixture used receipt summary without items; changed fixture to fetch detail and targeted rerun passed. First full browser36/37 exposed appended lot changing Movement accessible name; moved lot to Reference cell without changing assertions, rebuilt isolated web and targeted/full reruns passed. Combined API command timed out900s; successful split reruns are evidence, not a successful combined command. Sandbox EPERM checks reran with approved escalation.

## Visual inspection

Actual images inspected:batches320, write-offs1280, recalls320, expiry1280. Final full-rerun expiry320/1280 inspected again with actual expired fixture stock, not only empty state. No clipping in inspected Quality cards/forms; UUIDs wrap at320. Browser asserts four routes at320/375/768/1280/1920, no horizontal overflow and keyboard focus. Artifacts:`test-results/quality-Quality-real-recei-8aa91-ecall-and-responsive-routes/quality-*.png`. Scoped smoke, not full WCAG audit.

## Policies, limitations and exact next work

- One batch per variant/document line; no split-lot allocation. FEFO never auto-attests physical selection.
- Legacy stock is explicitly untracked without invented dates; sellable unless product-wide recalled. Unknown expiry is not freshness assurance.
- Expiry≤Bangkok business date is not sellable. Expired/recalled/quarantined lots cannot be sold/replenished. Unknown returns go DAMAGED/QUARANTINE; transfers back to sellable locations are blocked.
- COUNT/CORRECTION with positive tracked stock is blocked pending lot-aware count workflow. Recall activation irreversible; no release workflow.
- Write-off API requires explicit selection/reason/current branch permission and approval. Physical confirmation is a UI operator checkbox, not API `batch_verified`; removal never grants sellability.
- Traceability bounded by recorded labels/operator attestations; no production-grade physical provenance claim.
- Next:Phase5.7 single supplier→receiving→shelf→promotion→customer/loyalty→sale→return/refund/exchange→quality/audit lifecycle, security review, resilience/manual settlement boundaries, final regression/reconciliation/format/docs-link checks. Overall Phase5 cannot close before these pass.
