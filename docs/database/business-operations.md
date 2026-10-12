# Business operations schema (current: Returns/Refunds only)

`000008_business_operations.up.sql` is additive to migrations 1–7, which remain unchanged. It is forward-only like the existing migration chain. It has been applied only to isolated test/scratch databases, never the persistent primary volume. This business-operations checkpoint required clean schema **8**; current Go readiness requires clean schema23; missing, dirty or other versions fail readiness.

## Tables and references

| Table                       | Responsibility                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| customer_returns            | Original sale/branch, state/revision, reason, historical amount, creator/approver/completer, operation |
| customer_return_items       | Immutable original sale-item/variant snapshots, exact quantity/allocation and disposition/destination  |
| customer_refunds            | One refund per completed return, exact amount and immutable settlement evidence                        |
| refund_settlement_events    | Append-only settlement/reconciliation actions and evidence                                             |
| register_cash_disbursements | Append-only once-per-refund cash deduction against current shift                                       |

Tenant-composite FKs bind source sale/items, branch, variant, location, Inventory operation and shift; the added `(organization_id,sale_id,id)` sale-item identity prevents cross-sale source substitution. Quantities are NUMERIC(18,3), money NUMERIC(18,2); API values remain decimal strings. History/source indexes cover tenant/branch/date/ID and original-sale/item queries; a tenant/return unique key prevents duplicate refund creation.

`stock_movements.customer_return_item_id` references the return line; SALE_RETURN is added to the existing movement type domain. A partial unique index permits one movement per return item. NO_STOCK_RETURN must have no destination and no movement. Return movement guards validate the original approved document and matching variant/branch/quantity/disposition/location.

`register_shifts.cash_refunds` starts at zero. Current expected cash is opening plus cash sales minus confirmed cash refunds. Closed-shift identity/history stays immutable. Cash posting validates actor/context, current shift ownership, open status, branch, refund amount/method and sufficient expected cash.

## Guards and runtime access

All five tables ENABLE/FORCE RLS from transaction-local organization context. Missing/cross-tenant context sees zero rows. The API SET ROLE runtime is non-superuser/non-BYPASSRLS; privileged bootstrap credentials remain a separate production hardening limitation.

Runtime gets SELECT/INSERT/UPDATE on operational return/refund headers and SELECT/INSERT on immutable items/events/cash disbursements; no runtime hard-delete path is granted. History triggers reject completed-header mutations, changed financial snapshots, invalid transitions and evidence rewrites. Append-only triggers protect immutable rows even apart from grants.

Deferred consistency checks validate return header/item totals and cumulative quantities/refundable consideration, matching Inventory postings/refund amounts, required cash disbursements, and shift totals. Integration tests cover runtime write denial and rollback-only SQL alongside real transactional failure/retry. Managed shelf capacity is revalidated in the authorized Inventory service, not a new balance engine or a universal database-level capacity invariant.

## Reproducible acceptance

Use only the existing `smartpos-auth-test` project and its `smartpos` database or a fresh named scratch within that container. Do not run bare `npm run migrate` / `stack:up` against a persistent primary environment for verification.

The fresh acceptance database `smartpos_phase5_acceptance_20261010_c40fedb1` began with zero public tables. Official migrate runner applied versions 1–8 individually, each clean, then reran with no change. Six rollback-only SQL suites passed; existing isolated smartpos schema and users/organizations/sales counts were unchanged during scratch verification. Earlier scratch databases and both PostgreSQL volumes were retained. See [full evidence](../development/phase5-verification.md).

Migration 8 does not contain exchange, pricing, promotion, customer, loyalty or batch/quality tables. It has already been applied: implement future schema changes as forward-only follow-up migrations with matching readiness/contracts/tests, rather than silently editing this historical file.
