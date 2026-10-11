# Workspace boundaries

## Customer area

`/shop` uses StorefrontLayout, independent of OrganizationProvider and employee navigation. It never loads tenant catalog/customer data through employee endpoints. The page has a visible customer-area label and an explicit not-open-for-orders state. Public product publishing, customer identities, cart/checkout, order tracking, reservations, shipping and online payment settlement remain future work. No fabricated catalog, placeholder checkout success or financial mutations are provided.

## Team entrances

The public `/` page distinguishes customer, management and staff entrances. Both team entrances use the existing authentication system; selecting an entrance does not choose or grant a role. `/register` creates a team identity, not an online shopper account. Safe post-login navigation goes through `/workspace`, except for an explicit `/account` destination. Unsafe or arbitrary returnTo destinations cannot select a management role.

OrganizationProvider mounts only around organization/account/operational routes, not landing, authentication or storefront pages. `/workspace` waits for the current server-backed membership context. Owner and Manager default to `/dashboard`; Cashier, Inventory Staff and Purchasing Staff default to `/staff`. A signed-in identity without an organization continues at `/account`. Context errors remain visible rather than selecting a default privileged role.

## Management and staff

ManagementLayout and StaffLayout use a shared accessible shell but different menu definitions and home pages. Both show the workspace and actual membership role. Staff tools are filtered by current permissions; staff navigation never includes organization settings, employees, roles or pricing administration, even if a stale UI payload contains broad permissions. Existing API authorization remains authoritative.

The shared operational routes keep their established URLs and permission gates. Store settings, branch administration, employee pages and the role matrix also have a frontend Owner/Manager role gate. Staff visits to `/dashboard` resolve to `/staff`. Owner/Manager may visit the staff workspace or POS without changing their role. Permission refresh, organization switching and logout continue to use the existing tenant-query isolation.

`/customers` is labeled as a customer database for team use, not an online-shopper portal. `/products` is product management for management users and product information in staff navigation. POS has a selling-area label and returns to the role-appropriate workspace. POS terminals, shifts, settlement, inventory posting and receipt contracts are unchanged.

## Diagnostics and verification

The original development dashboard is retained at `/help/system`; its architecture counts and readiness are not business metrics. Anonymous help/diagnostics show neutral navigation, never management or staff tools. Mobile navigation keeps the same permission filtering, keyboard focus handling and area links as desktop.

Unit and browser tests cover role-based destinations, direct-link denial, stale role changes, permission-filtered tools, customer-layout isolation, mobile menu behavior and narrow/wide layouts. Browser role fixtures are UI simulations only and are not evidence of real backend authorization or online settlement. No database migrations or real transactions are necessary for this separation.
