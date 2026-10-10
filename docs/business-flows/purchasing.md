# Purchasing - Phase 4 implementation, acceptance pending

Supplier, purchasing and shelf workflows are implemented in the current working tree. Host-only checks pass; real database/integration/browser verification must still be rerun before closing the local acceptance gate. See [current evidence and blockers](../development/phase4-verification.md). The flow below describes intended behavior, not proof that runtime acceptance has passed.

Supplier registration -> draft order -> validated exact line quantities/prices -> approval -> ordered -> partial/full receiving -> atomic inventory receipt ledger -> completion. Receiving locks order/line state, checks remaining quantity, deduplicates receipt request and commits document/ledger/balances together. Supplier returns are separately authorized compensating movements.

Phase 6 AI recommends order quantities with data window/model/timestamp/explanation. Only authorized humans turn a recommendation into a draft/approved order. Deterministic reorder-point suggestions in Phase 4 must not masquerade as ML forecasts.

Tests: partial receipts, over-receipt denial, duplicate retries, inactive supplier, rejected approval, exact totals, receiving rollback, tenant/branch scope. No purchasing/AI prediction implementation in Phase 0.
