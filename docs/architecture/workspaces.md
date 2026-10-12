# Workspace boundaries

## Customer area

`/shop` uses StorefrontLayout, independent of OrganizationProvider and employee navigation. It never loads tenant catalog/customer data through employee endpoints. It exposes published stores/products, a store-specific guest cart and private order tracking through the public storefront API. The customer UI still offers unpaid pickup requests, not completed sales; new orders reserve snapshotted source stock, while legacy orders stay unreserved. Optional warehouse sourcing and internal customer payment/refund/delivery snapshots exist, but customer accounts, enabled online payment and complete shipment/return UI remain unfinished. The online-flow implementation is paused by the user; no fabricated catalog or placeholder financial completion is provided. See [storefront flow](storefront.md) and [current payment/fulfillment status](payment-sandbox.md#current-online-flow-status-2026-10-12).

## Team entrances

The public `/` page distinguishes customer, management and staff entrances. Both team entrances use the existing authentication system; selecting an entrance does not choose or grant a role. `/register` creates a team identity, not an online shopper account. Safe post-login navigation goes through `/workspace`, except for an explicit `/account` destination. Unsafe or arbitrary returnTo destinations cannot select a management role.

OrganizationProvider mounts only around organization/account/operational routes, not landing, authentication or storefront pages. `/workspace` waits for the current server-backed membership context. Owner and Manager default to `/manage/dashboard`; Cashier, Inventory Staff and Purchasing Staff default to `/work`. A signed-in identity without an organization continues at `/account`. Context errors remain visible rather than selecting a default privileged role.

## Management and staff

ManagementLayout and StaffLayout use a shared accessible shell but different menu definitions and home pages. Both show the workspace and actual membership role. Staff tools are filtered by current permissions; staff navigation never includes organization settings, employees, roles or pricing administration, even if a stale UI payload contains broad permissions. Existing API authorization remains authoritative.

Operational pages have separate browser namespaces: `/manage/products`, `/manage/inventory`, `/manage/pos`, and corresponding `/work/products`, `/work/inventory`, `/work/pos` routes. They reuse the same page implementations and existing permission parents without duplicating transaction logic. `scopeWorkspaceRoutes` derives both namespaces and compatibility redirects from the established route definitions. Logical module constants remain unprefixed internally; navigation definitions and WorkspaceLink/useWorkspaceNavigate scope browser destinations to the active area. Relative, neutral, external and already scoped destinations remain unchanged.

WorkspaceAreaGate denies non-management members access to `/manage/...`, except that the management home redirects them to `/work`. Administrative settings, employees, roles, pricing, promotions and discount approvals have no `/work/...` routes. Links to administrative tools from work resolve explicitly to `/manage/...` and are subject to the same role and permission boundaries. Store settings, branch administration, employee pages and the role matrix retain their existing frontend role gates. Owner/Manager may use any permitted work page without changing their role; internal module links and the POS return link preserve the work area. Permission refresh, organization switching and logout continue to use the existing tenant-query isolation.

Legacy `/dashboard` resolves to the role's canonical home; `/staff` resolves to `/work` for every permitted team member. Existing unprefixed module URLs redirect to the role-appropriate namespace, preserving dynamic IDs, query parameters and URL fragments. Legacy administration links always resolve to management and never grant permissions. `/manage` redirects to `/manage/dashboard`. Unknown paths still render the existing not-found page. Browser namespaces do not change `/api/v1/organizations/...` endpoints, payloads or database schemas.

`/manage/customers` and `/work/customers` are customer databases for team use, not online-shopper portals. `/manage/products` is product management and `/work/products` is product information in work navigation. POS has a selling-area label and returns to the active workspace. POS terminal, shift, settlement, inventory and receipt engines are retained; storefront adds an optional cart/order link, a staff import command and atomic order completion during existing sale settlement.

## Diagnostics and verification

The original development dashboard is retained at `/help/system`; its architecture counts and readiness are not business metrics. Anonymous help/diagnostics show neutral navigation, never management or staff tools. Mobile navigation keeps the same permission filtering, keyboard focus handling and area links as desktop.

Unit and browser tests cover role-based destinations, direct-link denial, stale role changes, permission-filtered tools, customer-layout isolation, mobile menu behavior and narrow/wide layouts. Browser role fixtures are UI simulations only and are not evidence of real backend authorization or online settlement. No database migrations or real transactions are necessary for this separation.
