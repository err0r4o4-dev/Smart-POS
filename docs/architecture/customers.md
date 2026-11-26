# Customer Management — Phase 5.4

Customer records are organization-owned business data, not authentication users. Authorized branches share records. Customers remains one of the canonical16 modules/106 planned routes. Phase5.4 implements three Customer routes; Phase5.5 adds real `/loyalty` and `/loyalty/history` with programs/accounts, immutable points and existing POS/Returns/Exchanges integration. See [Loyalty architecture](loyalty.md).

## Domain and persistence

- Forward-only migration `000011_customers.up.sql` creates `customers`, `customer_groups`, `customer_group_memberships`. Current readiness exact clean13 after additive Loyalty12 and Quality13; migrations1–11 unchanged.
- Organization-scoped codes normalize trim/uppercase. Optional names/contact/notes never require an account. Email is trimmed/lowercase; phone removes formatting separators, keeps optional `+`, and does not infer country codes. Nonempty normalized phone/email remain unique across active and archived records. Duplicate identifiers produce a generic conflict; there is no automatic merge.
- Customer and group updates/archive require current revisions. Create identity is scoped by organization, actor and Idempotency-Key with a normalized fingerprint. Current authorization precedes replay; replay reads the current resource rather than retaining a sensitive response cache. Default GENERAL/MEMBER/VIP groups are seeded for real organizations with a creator.
- Memberships use organization-safe composite references and customer/group revisions. Archived groups/customers cannot acquire new membership. Counts describe retained memberships, including historical archived customers; archival does not delete membership or transactions. UI/API provide bounded pagination and literal prefix search.
- FORCE RLS uses transaction-local organization context. Runtime grants exclude customer/group DELETE and membership UPDATE. Completed Sales retain immutable nullable customer references and code snapshots.

## Authorization and privacy

Owner/Manager have `customers.read`, `customers.manage`, `customers.select`, `customers.groups.read`, `customers.groups.manage`, `customers.history.read`. Non-owners need assigned active branches; history additionally filters committed Sales by authorized branch. Cashier can read/select customers and read groups but receives only the phone suffix and masked email, no private notes or marketing consent. Inventory/Purchasing roles have no customer permissions.

Customer search in the UI uses CSRF-protected `POST /customers/search` so contact identifiers are not put in URLs. All Customer responses are `Cache-Control: no-store`. Audit contains events/actor/object references, never copied contact details or notes. Error messages do not reveal duplicate PII. Marketing consent defaults false and requires explicit opt-in. Receipt/checkout display only the customer code snapshot or Walk-in.

Frontend query keys include user/organization/branch. Workspace/POS remount on context changes; existing OrganizationProvider cancels and removes tenant queries on switching and logout. Unsaved customer drafts cannot follow another context. Server permissions remain authoritative, even with stale UI state.

## POS settlement boundary

`PATCH /pos/carts/{resourceId}/customer` accepts the current cart revision and a nullable customer ID. The backend validates own active cart, tenant, permission and active customer. Checkout input does not accept an arbitrary customer ID. Item edits preserve selection; held-cart resume revalidates and explicitly reports `customer_cleared` after archival.

Prepare → acknowledge funds → complete is unchanged. Prepare freezes customer ID/code. Completion revalidates customer availability and commits the customer reference in the existing Sale/Inventory/payment transaction. Archival after funds acknowledgement produces durable `RECONCILIATION_REQUIRED` / `CUSTOMER_UNAVAILABLE`, not a fabricated Sale or discarded funds. Completed Sales cannot be edited to attach a customer. Historical exchange replacements inherit the original Sale customer/code, even after archival, because that is historical continuity rather than a new selection.

## Authoritative activity definitions

Customer history reads Sales, payments, Returns, refunds and adjustment documents, with their persisted status, timestamp, branch and source Sale links. It exposes SALE / REPLACEMENT / RETURN / REFUND / EXCHANGE / REVERSAL rows. `paid` sums only `sale_payments.amount`; replacement credit and return document values are not new funds. `refunded` sums only CONFIRMED refunds; pending amounts are separate. `net_collected = paid - confirmed refunds`. A replacement is counted separately from an original purchase, and a refund is counted once through its refund document, never again through its adjustment.

Pagination is server-side; filters accept an authorized branch and paired timestamps spanning at most 366 days. Summary covers all filtered activity, not only the displayed page. Timestamp filtering applies to each activity's own time; this is a cash-activity view, not accounting profit, customer lifetime value or tax reporting.

## Retention and production gates

Archival is not erasure. Historical IDs/code snapshots, retained memberships and idempotency fingerprints remain; this phase provides no hard-delete/merge/restore workflow. Obtain an approved retention/erasure policy and assess legal obligations before production. Dedicated runtime LOGIN, TLS/secrets/SMTP, backup/restore and rollout, load testing, real hardware/printing and a full accessibility review remain separate gates. See [local acceptance evidence](../development/phase54-verification.md).
