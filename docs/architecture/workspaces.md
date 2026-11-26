# Workspace boundaries

## Owner-only transition (2026-11-05)

The approved change limits backoffice access to active OWNER memberships and
retires the `/work` workspace and employee administration. Account/login and
`/shop` ordering remain in scope. Implementation and acceptance are in progress;
current acceptance has not yet been established. See `TODO.md` for current checks.

## Customer area

`/shop` uses StorefrontLayout, independent of OrganizationProvider and employee navigation. It never loads tenant catalog/customer data through employee endpoints. It exposes published stores/products, a store-specific guest cart and private order tracking through the public storefront API. The customer UI still offers unpaid pickup requests, not completed sales; new orders reserve snapshotted source stock, while legacy orders stay unreserved. Optional warehouse sourcing and internal customer payment/refund/delivery snapshots exist, but customer accounts, enabled online payment and complete shipment/return UI remain unfinished. The online-flow implementation is paused by the user; no fabricated catalog or placeholder financial completion is provided. See [storefront flow](storefront.md) and [current payment/fulfillment status](payment-sandbox.md#current-online-flow-status-2026-10-12).

## Backoffice workspace

The owner-only transition is in progress. Its target is a management workspace for active OWNER memberships. Server authorization remains authoritative; frontend route and navigation guards are presentation controls. Non-owner memberships must not gain backoffice access. Organization selection, session and tenant cache boundaries remain relevant.

The transition retires the staff workspace and employee, invitation and role administration screens. Historical membership and account records remain. Account/login and the public customer area remain available. The precise redirect and denial behavior must be checked against the integrated frontend and current browser results.

## Diagnostics and verification

The original development dashboard is retained at `/help/system`; its architecture counts and readiness are not business metrics. Anonymous help/diagnostics show neutral navigation, never management or staff tools. Mobile navigation keeps the same permission filtering, keyboard focus handling and area links as desktop.

Historical unit and browser tests covered role-based destinations, direct-link denial, stale role changes, permission-filtered tools, customer-layout isolation, mobile menu behavior and narrow/wide layouts. Those browser role fixtures were UI simulations and are not evidence of real backend authorization or online settlement. No database migrations or real transactions are necessary for this separation.
