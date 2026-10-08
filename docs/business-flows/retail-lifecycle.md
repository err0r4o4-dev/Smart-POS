# Retail lifecycle - target

Store setup -> catalog/product registration -> suppliers -> purchase order draft/approval -> goods receipt -> warehouse ledger/balances -> shelf replenishment -> POS checkout -> confirmed payment -> sale and stock deduction -> receipt -> reporting -> AI forecast/reorder proposal -> human-approved purchase draft -> next cycle.

Identity/organization owns tenant and branch context. Catalog owns identifiers/units. Purchasing orchestrates receiving with inventory in one transaction. Shelves orchestrates inventory transfers. Sales coordinates pricing, payments, stock and receipts with idempotency. Reporting projects durable events; intelligence uses authorized snapshots and produces proposals only.

Unknown barcode requires registration/selection; scanning alone does not supply metadata. Shelf counts are system-recorded until physical counting or appropriate hardware confirms them. All business steps are planned; only foundation health/presentation exists in Phase 0.
