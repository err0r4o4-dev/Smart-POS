# Purchasing - Phase 4 completed (Local)

Supplier, purchasing and shelf workflows passed the local acceptance gate on 2026-10-10, including real database/integration/browser verification. See [final evidence and production limitations](../development/phase4-verification.md). This is local acceptance, not production readiness or authorization to start Phase 5.

Supplier registration -> draft order -> validated exact line quantities/prices -> approval -> ordered -> partial/full receiving -> atomic inventory receipt ledger -> completion. Receiving locks order/line state, checks remaining quantity, deduplicates receipt request and commits document/ledger/balances together. Supplier returns are separately authorized compensating movements.

Phase 6 AI recommends order quantities with data window/model/timestamp/explanation. Only authorized humans turn a recommendation into a draft/approved order. Deterministic reorder-point suggestions in Phase 4 must not masquerade as ML forecasts.

Tests: partial receipts, over-receipt denial, duplicate retries, inactive supplier, rejected approval, exact totals, receiving rollback, tenant/branch scope. No purchasing/AI prediction implementation in Phase 0.
