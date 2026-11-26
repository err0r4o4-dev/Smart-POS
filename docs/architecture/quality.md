# Batch, expiry and quality control

Phase5.6 extends Inventory, preserving canonical16 modules/106 planned routes. See [local acceptance and limits](../development/phase56-verification.md).

## Authoritative state

`stock_movements` remains append-only authoritative history. Migration13 adds `product_batches`, `quality_stock_balances`, `quality_write_offs`, `quality_recalls` and nullable batch references on existing items/movements. Quality balances are projections updated inside existing posting transactions, not a second stock engine. Every organization/location/variant satisfies aggregate=tracked+explicit null-batch untracked. Existing stock is untracked, never fabricated provenance.

Tenant-safe composite references, FORCE RLS and runtime grants cover new tables. Existing transaction/organization serialization, row locks and trigger checks protect Sale/Transfer/WriteOff/Recall races. Current actor/branch permissions precede cached idempotency results.

## Operational boundaries

- Receiving records physically observed identity and optional dates. Identifying metadata cannot be silently rewritten; authorized status changes retain immutable operation snapshots/audit.
- FEFO recommends, never auto-verifies. Posting rechecks selected lot availability and safety, not merely cart/task creation.
- Tracked sellability requires ACTIVE, no recall, null expiry or expiry strictly after Bangkok business date. Variant-wide recalls block untracked stock. Unknown dates are not freshness guarantees.
- Supplier returns preserve receipt lot; known customer returns preserve original Sale lot. Unknown returns cannot restore sellable stock or be laundered through DAMAGED/QUARANTINE transfers.
- Write-offs use REQUESTED→APPROVED→POSTED or REJECTED, revision/idempotency/reason and existing immutable Inventory posting. No fake payment.
- Recall activation irreversible; physical retrieval/disposal is an operator workflow, not backend-certified.
- One batch per variant line; split allocation/tracked counts not implemented. COUNT/CORRECTION blocked with positive tracked balances.

## Interfaces

Routes:`/inventory/batches`, `/inventory/expiry`, `/inventory/write-offs`, `/inventory/recalls`. Receiving/Shelf/Inventory/POS/Returns/Exchange expose selection. `/quality/lots` reads identity/history; `/quality/batches` reads stock projection; `/quality/expiry` reads dated stock. Write-offs/recalls reuse Inventory idempotency/audit. OpenAPI documents actual payloads and backward-compatible optional batch fields.

Write-off physical confirmation is UI-only operational acknowledgment, not server attestation. API callers supply explicit selection, reason and authorized approval; quantity removal never makes unsafe stock sellable. Production provenance, hardware scanning, unknown legacy expiry enforcement and recall-release certification remain separate gates.
