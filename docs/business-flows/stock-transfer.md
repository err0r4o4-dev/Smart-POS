# Stock transfer - Phase 2/4 target

Authorize actor/tenant/branch and both locations. Validate product/unit/batch and positive exact quantity. Claim idempotency key. Lock source/destination balances in stable order. Reject insufficient source or invalid destination.

One transaction creates transfer document and paired TRANSFER_OUT/TRANSFER_IN ledger entries, updates balances and persists result/outbox. Failure rolls back both sides. Warehouse 100/shelf 20 moved 30 gives 70/50, total 120. Never create two independent commits.

Cross-branch movement uses in-transit and explicit receiving; destination is not available at dispatch. Physical shelf count differences use separately authorized adjustment with recorded reason. Tests: conservation, double-submit, concurrent transfer, opposite lock order, rollback and cross-tenant reference rejection. No transfer endpoint exists in Phase 0.
