# VELOPOS migration design

Status: RECONCILED SPECIFICATION; implementation and runtime acceptance remain pending.
Date: 2026-11-19 (Asia/Bangkok)
Baseline: VELOPOS-SCOPE-BASELINE-001, approved-requirements.md, VLP-001 through VLP-092.
Read requirements.md for exact approved wording, current evidence and unresolved parameters.

<a id="d01"></a>

## D01. Architecture and compatibility

Keep React/TypeScript/Vite -> Caddy -> public Go modular monolith -> PostgreSQL.
The FastAPI AI service stays internal and is reached through Go only. Reuse
existing identity, organization, restaurant, storefront, pricing and financial
transaction seams where their invariants match. Do not add a framework, database
or external service merely because a capability is planned.

All 92 decisions remain approved scope. The task groups are proposed engineering
sequencing, not an approved reduced MVP or permission to omit advanced features.
Physical table names, endpoint payloads and module additions remain design work.
A requirement being approved does not make a proposed storage mapping approved.

Preserve applied migrations 000001-000039, retail records, branch memberships,
stock/sales/receipts, existing payment/refund evidence and live dependencies.
Current source requires schema 39; the actual database version was not queried.
Prefer additive, restaurant-native records. B01 Option A was approved by the user
on 2026-11-19: one organization per restaurant, with organization as tenant and
restaurant identity. A distinct restaurant aggregate is not selected. The mapping
is a design decision, not proof that retained data already satisfies it.
No new product branch hierarchy, staff module or ingredient inventory is implied.

Contract changes must match Go routes and types, OpenAPI, route inventory, React
clients/query keys and affected tests. Current route inventory has 18 modules
and 115 route entries; that count is not runtime route parity. Preserve versioned
compatibility or document replacements before deprecating routes.

Future schema acceptance requires fresh and retained-data upgrades, RLS/scoped
query denial tests, constraints, concurrency, rollback refusal and forward
recovery on confirmed isolated task-owned databases. No migration or service
startup is authorized by this specification update.

### T1.1/T2.1 planning record — compatibility decision frame

Evidence reviewed: migrations 000001, 000003, 000014, 000017, 000027, 000037-000039;
organization authorization docs; restaurant setup/menu code; storefront order/payment
code; and the current queue implementation. This is a design planning result, not
an implementation acceptance result or a migration specification. The user
subsequently selected B01 Option A on 2026-11-19; only that mapping is approved.

#### Existing ownership facts

- organizations.id is the tenant key. branches belongs to one organization, and branch membership/authorization is already part of the retained model.
- restaurant_profiles.organization_id is currently the primary key and foreign key to organizations. Restaurant setup, dining zones/tables, menu categories, menu items, storefront restaurant identity and RLS currently reuse this key.
- Restaurant storefronts are already distinguished from legacy POS storefronts by immutable source_kind; restaurant storefront identity is derived from the organization-backed restaurant profile.
- online_orders retains organization/branch/terminal/stock-location identity. Payment attempts reference orders by organization/order keys; branch identity is inherited through the order, not a direct attempt column. Queue periods, numbers and allocation remain branch-scoped, ordered by ticket/order creation timing.
- Existing payment attempts and reconciliation records have durable evidence and tenant scoping. Existing order status is not sufficient to represent independent Payment, Kitchen and Fulfillment lifecycles or verified handover.

#### Mapping options

| Option | Shape                                                                                                                                                                                             | Compatibility                                                                     | Main risk                                                                                                                                | Status                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A      | Treat one existing organization as one restaurant; allow one Owner to hold separate active organizations. Retain branches as a legacy operational adapter until the restaurant queue is migrated. | Highest; reuses current restaurant/profile/storefront/menu/RLS keys.              | Must enforce one physical restaurant per organization and prevent branch identity from silently creating multiple restaurants or queues. | Selected by user on 2026-11-19; B01 mapping resolved. Detailed adapter/data acceptance remains pending. |
| B      | Add a distinct restaurant aggregate linked to organization, then link profiles/storefronts/orders/queues to it while retaining organization and branch FKs.                                       | Preserves explicit restaurant identity and future multi-restaurant organizations. | Broad dual-key migration, backfill, query/RLS complexity and higher retained-data risk.                                                  | Not selected; requires stronger evidence and scope authorization.                                       |

#### Recommended compatibility boundary

Use approved Option A: organization remains the tenant and restaurant identity; one Owner may manage multiple organizations, each representing one restaurant. Keep branch records and branch-scoped legacy callers intact. Proposed implementation boundary: a single restaurant-context adapter at the service boundary lets new restaurant workflows use canonical restaurant context while legacy order/queue queries receive an explicitly selected branch. Adapter details and retained-data compatibility still require design and verification; selecting A does not authorize implementation.

The profile primary key already permits only one profile per organization. The adapter must reject missing or ambiguous legacy branch/source mappings and cross-tenant branch context. Never use the frontend's first-branch fallback as an approved mapping or create fake branches, terminals or stock locations. A branch adapter alone cannot make restaurant drafts orderable: migration 000039 requires RESTAURANT sources to remain unpublished and closed, without either terminal, and makes source_kind immutable. Production ordering needs a separately reviewed additive design after B01; do not flip a legacy source kind or weaken the draft guard as a shortcut.

#### Bounded producer/consumer inventory

Static source inventory, 2026-11-19. Paths are repository-relative; test files are existing verification seams, not fresh passing tests. This covers the inspected setup-to-order/queue/POS flow, not every repository caller or external integration. Contract artifacts remain unchanged.

| Boundary                 | Producer / schema evidence                                                                                                                                    | Consumer / compatibility constraint                                                                                                                                                                           | Existing test seam                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant and Owner         | `database/migrations/000003_organization.up.sql`, protect_organization_owner                                                                                  | Guard requires at least one active Owner, not exactly one. B01/T1.3 must address retained multiple-Owner data without assumed membership deletion.                                                            | `apps/web/src/app/restaurant-scope.test.tsx` covers client scope only; single-Owner DB/permission acceptance remains required.                                |
| Setup/profile            | `apps/api/internal/modules/restaurant/setup.go`, `apps/api/internal/modules/restaurant/organization_setup.go`; migration 000037                               | `apps/web/src/features/organization/setup-api.ts` accepts optional branch context. Keep org-native and branch setup distinguishable.                                                                          | `apps/web/src/features/organization/setup-api.test.ts`; `apps/api/internal/modules/storefront/branchless_setup_integration_test.go`                           |
| Menu/catalog             | `apps/api/internal/modules/restaurant/organization_menu.go`; migration 000038; `apps/api/internal/modules/storefront/catalog_browse.go`                       | Menu registry references catalog category/product/variant identities. Preserve tenant references and purchase snapshots.                                                                                      | `apps/api/internal/modules/storefront/branchless_menu_integration_test.go`; `apps/api/internal/modules/storefront/branchless_catalog_integration_test.go`     |
| Storefront source        | `apps/api/internal/modules/storefront/organization_settings.go`; migration 000039                                                                             | RESTAURANT drafts cannot publish/accept orders. `apps/web/src/features/storefront/OnlineOrderPages.tsx` still selects POS terminals. Source kind cannot convert in place.                                     | `apps/api/internal/modules/storefront/branchless_settings_integration_test.go` asserts closed draft, public/directory exclusion and legacy publish rejection. |
| Quote preview            | `apps/api/internal/modules/storefront/organization_quote.go`, QuoteOrganization/organizationQuote                                                             | Authenticated verified-user preview permits PICKUP/DELIVERY, rejects table token and branch/terminal/location settings. It is not public four-mode checkout.                                                  | `apps/api/internal/modules/storefront/organization_quote_test.go`; `apps/api/internal/modules/storefront/organization_quote_integration_test.go`              |
| Operational order        | `apps/api/internal/modules/storefront/orders.go`, CreateOrder; migration 000014                                                                               | `apps/web/src/lib/storefront-api.ts` and order pages consume branch-linked orders. NOT NULL composite branch/terminal/location FKs and immutable identity prevent branchless writes by DTO changes alone.     | `apps/api/internal/modules/storefront/queue_integration_test.go`; `apps/web/src/features/storefront/OnlineOrderPages.test.tsx`                                |
| Table QR                 | organization_setup.go writes restaurant_dining_zones/restaurant_dining_tables; orders.go dineInTable reads restaurant_tables                                  | Setup dining tables and operational branch/QR-hash tables are different families. Define explicit tenant/table compatibility; never copy private tracking/session tokens into public QR.                      | branchless_setup_integration_test.go and queue_integration_test.go above; cross-family QR acceptance remains pending.                                         |
| Queue                    | `apps/api/internal/modules/restaurant/queue.go`, AssignQueueNumber/queueQuery; migration 000027                                                               | `apps/web/src/features/restaurant/RestaurantPage.tsx` requests branch queue. CreateOrder preallocates tickets before payment; visibility requires PAID, unreleased hold and refund/reconciliation exclusions. | `apps/api/internal/modules/storefront/queue_integration_test.go`; `apps/api/internal/modules/storefront/queue_schema_integration_test.go`                     |
| Payment/reconciliation   | `apps/api/internal/modules/storefront/payments.go`, paymentTx/readPayment; `apps/api/internal/modules/storefront/payment_reconciliation.go`, staffPaymentTx   | `apps/web/src/features/storefront/ShopTrackingPage.tsx` consumes payment/tracking projections. Preserve attempt evidence/replay/tenant proof; generic order completion is not verified payment.               | `apps/web/src/features/storefront/ShopTrackingPage.test.tsx`; select and rerun payment/hold/reconciliation coverage for the chosen slice.                     |
| POS settlement           | `apps/api/internal/modules/pos/online_orders.go`, ImportOnlineOrder/completeOnlineOrder; `apps/api/internal/modules/pos/prepaid.go`, SettlePrepaidOnlineOrder | `apps/web/src/features/storefront/OnlineOrderPOS.tsx` retains cart/terminal/stock/shift coupling. READY import and prepaid settlement link sale completion; new handover must preserve financial history.     | `apps/api/internal/modules/pos/online_orders_test.go`; restaurant fulfillment compatibility cases remain required.                                            |
| Client scope/cache       | `apps/web/src/app/OrganizationProvider.tsx`; `apps/web/src/features/restaurant/restaurant-hooks.ts`                                                           | Keys include user/org/branch; queries require branch and poll at 15000 ms; mutations invalidate tenant prefix. New restaurant context needs explicit keys/enabled/invalidation changes and server scope.      | `apps/web/src/app/restaurant-scope.test.tsx`; `apps/web/src/features/organization/ContextSwitchers.test.tsx`                                                  |
| Route/contract ownership | `apps/api/internal/transport/router.go`; restaurant/storefront HTTP handlers; `packages/contracts/openapi.yaml`                                               | `packages/contracts/routes.json` has 115 UI inventory entries, not backend endpoint parity. Later slice must specify exact method/path/payload/error and affected callers.                                    | Contract inventory and selected producer/consumer tests remain unrun for this documentation step.                                                             |

#### Compatibility decisions still required

- B01 mapping is resolved to A by the user's 2026-11-19 selection. T1.1/T1.3/T2.1 must still document zero/multiple legacy branch contexts, existing multiple-Owner handling and retained-data exceptions. Do not silently merge restaurants, delete memberships or choose the first branch.
- T1.1/T1.2: define independent lifecycle projections and an orderable restaurant-native path without assuming draft publication or table-family equivalence. Preserve public/private tracking boundaries.
- B04: distinguish preallocated display ticket from eligible kitchen work. Current queue sorts by COALESCE(ticket.issued_at,doc.created_at),doc.id within branch/period scope. Paid-time FIFO requires authoritative paid time, tie-break and late-event dispatch rules.
- T2.1: inspect retained data only on an authorized target before estimating backfill or asserting one-to-one mapping. No database was queried here. Define additive keys, FK/RLS/check/unique constraints and coexistence after B01.

#### Lifecycle and transaction frame

Model the domain as separate logical records and append-only events, even if the first implementation temporarily stores some state on existing records:

- Payment: attempt state, provider evidence, verified successful payment time, reconciliation state and reservation/hold state.
- Kitchen: Queued, Preparing and Ready, with one restaurant-wide queue identity and eligibility derived from verified Paid plus existing hold/refund/reconciliation safeguards.
- Fulfillment: channel-specific handover evidence, Completed or No-Show, actor/time and replay-safe verification. Ready and receipt presentation never imply Completed.

Proposed transaction boundaries are: checkout intent and immutable snapshot; authoritative payment evidence plus coupled local effects; queue allocation plus kitchen eligibility; handover evidence plus fulfillment transition; and refund/benefit adjustments. Proposed lock order is organization/restaurant scope, then stable order/attempt identity, then affected ledger/queue rows. It is not a verified global lock graph. Idempotency keys, unique constraints and revision checks must make duplicate callbacks/retries return one result. Exact paid-time tie breaking, delayed earlier-paid dispatch and provider timeout values remain B03/B04 policy inputs.

Observed lock fragments: paymentTx sets tenant context and locks organizations FOR UPDATE; readPayment locks the scoped attempt FOR UPDATE. organization.authorized also locks the active organization before membership/permission evaluation. Both staffPaymentTx and POS begin inherit that organization lock before their order/attempt locks. AssignQueueNumber takes an organization/branch advisory transaction lock. The bounded lock-edge inventory below includes these inherited locks; it does not establish every caller's preceding/following locks or prove absence of deadlocks.

#### T2.1 schema compatibility outcome

No migration is authorized by this planning step or B01 selection. Before any schema change, complete the affected producer/consumer inventory and compatibility design for approved Option A. The likely additive sequence is:

1. Prove the selected restaurant mapping against retained organization/branch data.
2. Add only nullable/backfillable compatibility metadata or new append-only tables; do not rewrite applied migrations 000001-000039.
3. Backfill in bounded, tenant-scoped batches with counts and hashes before/after.
4. Add NOT NULL, unique, foreign-key, RLS and trigger constraints only after the backfill is complete and verified.
5. Keep old branch-linked reads/writes during dual-read comparison; cut over only after contract, tenant-isolation, replay and concurrency checks pass.
6. Preserve forward recovery. Do not plan destructive rollback, retained-volume reset or automatic deletion of legacy branches/orders/payments.

Design-only acceptance evidence for T1.1/T2.1 includes approved B01 mapping, aggregate and lifecycle tables, the bounded producer/consumer inventory, FK/RLS/unique/check design, lock/idempotency rules, specifications for fresh/retained schema-39 compatibility checks and the forward-recovery runbook. Executed compatibility checks remain a separate future implementation gate. Neither document presence nor planning review establishes runtime acceptance.

#### Option A aggregate and constraint proposal

Design draft, 2026-11-19. Only B01 identity is user-approved. The physical names below are proposed new tables for design review, not applied schema, approved HTTP contracts or additional product requirements. Preserve existing migration files and all legacy transaction tables. An organization-backed restaurant root does not require a second restaurant aggregate or a fabricated operational branch.

| Logical owner / proposed storage                                                                   | Identity and references                                                                                        | Constraints and compatibility intent                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant root / existing restaurant_profiles                                                     | organization_id remains root and tenant key                                                                    | Existing PK/FK is reused. One physical restaurant per organization; do not infer compliance from row count. Owner authority stays a server decision; conflicting legacy memberships require explicit resolution, not deletion by backfill.                                                          |
| Selling readiness / proposed restaurant_selling_states                                             | One row per organization, revision and activation evidence references                                          | Separate readiness from setup completion and Admin approval. Leave storefronts.source_kind, terminal nullability and draft guards unchanged. This new projection cannot itself authorize checkout without approved verification/service/provider prerequisites.                                     |
| Orders and immutable items / proposed restaurant_orders and restaurant_order_items                 | Composite tenant/order identity; item identity within order; immutable purchase/menu/option/discount snapshots | No branch, terminal, shift, sale or ingredient location is required by the native order. Composite tenant FKs prevent cross-restaurant links. Preserve exact monetary/quantity representations, currency and established rounding. Amendments append approved deltas; no historic snapshot rewrite. |
| Command replay / proposed restaurant_order_commands                                                | organization, principal-or-guest scope, operation and idempotency key                                          | Unique command identity with normalized fingerprint and saved result. A replay checks current proof/authority before returning scoped data. Same key with changed payload conflicts; retries cannot create another order or handover.                                                               |
| Payment attempts and evidence / proposed restaurant_payment_attempts and restaurant_payment_events | Tenant/attempt key and tenant/order FK; verified provider/account/environment/event identity                   | Preserve evidence and provider-paid time separately from observed time. Deduplicate only after authenticating account ownership. Prevent simultaneous unresolved attempts for one order; final active-state predicate depends on B02/B03. Contradictory evidence remains reviewable, never erased.  |
| Kitchen / proposed restaurant_kitchen_states                                                       | Unique tenant/order FK and revision; optional eligibility reference before dispatch                            | At most one kitchen projection per order. A unique restaurant-wide queue entry references verified Paid evidence; display number is not payment or FIFO authority. Exact queue key tie/dispatch protocol remains B04.                                                                               |
| Fulfillment / proposed restaurant_fulfillments and restaurant_handover_events                      | Unique tenant/order projection plus append-only command/evidence identity                                      | Record channel, actor, proof reference, time and revision. Completed requires verified handover; No-Show requires B15 evidence. A receipt or POS settlement cannot synthesize this record.                                                                                                          |
| Legacy bridge / proposed restaurant_legacy_order_links                                             | Unique tenant/legacy-order FK and unique tenant/native-order FK                                                | Optional explicit one-to-one bridge only when both records are proven to represent the same transaction. Preserve native and legacy provenance. Do not mirror every historical order or write both lifecycles as independent authorities.                                                           |

All proposed tenant tables need ENABLE/FORCE RLS, matching USING/WITH CHECK tenant predicates, least-privilege runtime grants and scoped queries. Tenant-owned parent references use composite keys, including bridge/payment/queue/handover references. Missing/foreign tenant context must deny reads and writes. Runtime uses smartpos_runtime via database.Open; verify actual role and policies on the isolated target rather than assuming source equals deployed configuration.

Append-only events need immutable identity/history enforcement; mutable projections need positive revisions and compare-and-update checks. Evidence, state projection, audit and coupled reservation/queue effects commit together. New quota/coupon/points reservations implement approved resource rules, not ingredient inventory; exact allocation/timeout/refund policies remain B03/B09/B14. Physical columns, indexes, state enums and API payloads require the relevant design/contract gate before DDL or code.

#### Independent lifecycle transition proposal

These are logical transition contracts, not finalized wire enums. Each command resolves restaurant/actor proof, scopes every record, checks expected revision and command replay, then changes only the owning lifecycle and coupled effects. Invalid, stale or unauthorized commands leave all business effects unchanged. A matching authorized replay returns the original result without another event or effect.

| Input / observation                                        | Allowed result and coupled effect                                                                                                                                                                                                                                                                                                                                               | Rejected inference / unresolved gate                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Valid checkout, current menu and available benefits/quotas | Persist immutable order/attempt intent and reservations atomically                                                                                                                                                                                                                                                                                                              | Cart save does not reserve; client price or stale quote cannot authorize a purchase. B03/B14 determine hold timing/allocation.                                                                                                                   |
| Authenticated matching provider success                    | Persist verified payment evidence and authoritative paid time; retain original purchase snapshot. Expose kitchen work once only when current hold, refund and reconciliation eligibility is satisfied under the accepted path. A late success after irreversible legacy hold release preserves evidence and goes to review without restoring the hold or exposing kitchen work. | Redirect, slip, owner action, receipt, event arrival time and legacy COMPLETED do not prove Paid. B02 specifies evidence semantics; B03 governs recovery and B04 controls dispatch ordering. No native replacement eligibility is approved here. |
| Missing callback, query timeout or unknown outcome         | Keep payment checking/reconciliation and reservations; recover same order/attempt                                                                                                                                                                                                                                                                                               | Do not mark unpaid, unlock, start a second charge or lose paid work. B03 supplies cutoff/query/recovery policy.                                                                                                                                  |
| Authoritative confirmed unpaid                             | Apply approved release/retry rules with append-only evidence and revision checks                                                                                                                                                                                                                                                                                                | Local timer alone is insufficient. A later Paid observation never silently resurrects an irreversibly released legacy hold; preserve evidence and route to review.                                                                               |
| Queued to Preparing to Ready                               | Whole-order kitchen transition only with verified payment and current eligibility                                                                                                                                                                                                                                                                                               | Preserve legacy unreleased-hold, refund-state and FULFILLMENT_REVIEW exclusions until an accepted native replacement exists. B04 must settle late earlier-paid dispatch.                                                                         |
| Ready to Preparing correction before handover              | Append actor/time/reason/Before/After and notify an affected customer; retain paid/FIFO identity                                                                                                                                                                                                                                                                                | No silent snapshot/time edit, automatic refund or correction after handover outside Admin review.                                                                                                                                                |
| Channel-specific handover verification                     | Append replay-safe handover evidence and set fulfillment Completed                                                                                                                                                                                                                                                                                                              | Kitchen Ready, elapsed time, POS sale and receipt presentation cannot complete fulfillment. Exact proof/authority contracts remain T1.2/T1.3.                                                                                                    |
| No-Show or pre-Preparing amendment                         | Record only approved actor/evidence and customer-approved non-increasing amendments                                                                                                                                                                                                                                                                                             | Do not invent No-Show timeout/proof (B15), routine post-Preparing edits, or benefit/refund allocation (B09).                                                                                                                                     |
| Full/partial manual merchant refund evidence               | Append linked refund/benefit records without erasing Paid, snapshots or receipt history                                                                                                                                                                                                                                                                                         | Merchant transfer report is not customer receipt confirmation. Legacy provider-refund primitives are compatibility evidence, not approval to automate food refunds.                                                                              |

For B04, schema must retain provider-paid time, observation time and immutable identity without assigning an unapproved tie-break or discovery cutoff. Sorting currently known events cannot prove strict FIFO when an earlier paid event is still unknown. Provider completeness/query guarantees and the dispatch/recovery decision must be established before promising FIFO or ETA/capacity acceptance. No queue-wide wait duration, priority exception or paid-time rewrite is selected here.

#### Observed lock edges and proposed native order

Static observations from current Go and migration source, not a runtime lock trace. O = organization row FOR UPDATE; L = legacy order; P = attempt; R = refund intent; Q = organization/branch advisory queue lock. An arrow is acquisition/call sequence, not a claim that every intermediate query takes a row lock.

| Flow / source                                                                                                                                                    | Observed sequence                                                                                                                                                                                                               | Implication for compatibility                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized tenant commands: `apps/api/internal/modules/organization/service.go`, authorized                                                                      | Tenant context, O, membership/permission read                                                                                                                                                                                   | storefront.authorized and POS begin inherit O. Do not describe their order/attempt locks as preceding organization authorization.                                                                                                   |
| Public create: `apps/api/internal/modules/storefront/orders.go`, CreateOrder; service.go public                                                                  | Public resolver/context, O, quote/table FOR SHARE where applicable, order/items INSERT, Q, period counter upsert, ticket/event INSERT, commit                                                                                   | Tickets predate payment. The branch advisory lock serializes legacy numbering, not restaurant-wide paid-time dispatch.                                                                                                              |
| Payment start: `apps/api/internal/modules/storefront/payments.go`, BeginCustomerPayment/trackingPaymentTx                                                        | Tracking proof/context, O, P if present; otherwise attempt INSERT, commit                                                                                                                                                       | Existing unique attempt per order and stock-reservation guards cannot be repurposed as native multi-attempt design without acceptance.                                                                                              |
| Provider checkout/query: `apps/api/internal/modules/storefront/payment_checkout.go`                                                                              | Prepare/replay transaction with O/P, commit or rollback; external call; new transaction with O/P, evidence INSERT and projection UPDATE, commit                                                                                 | Provider calls are outside these local transactions. Revalidate identity and durable fingerprint on return; unknown network outcome is not permission for a new charge.                                                             |
| Webhook: payments.go AcceptCustomerWebhook                                                                                                                       | Authenticate/validate event, O, P, inbox replay check/INSERT, attempt UPDATE, commit                                                                                                                                            | Duplicate-event fingerprint mismatch conflicts; preserve evidence and guards. Current Stripe test event timing does not prove production PromptPay paid-time completeness.                                                          |
| Staff review/refund: `apps/api/internal/modules/storefront/payment_reconciliation.go`, staffPaymentTx; `apps/api/internal/modules/storefront/payment_refunds.go` | O, L, branch permission, P; refund prepare adds R, commits; provider operation; finalize reopens O/L/P/R and writes evidence, hold/order effects and audit                                                                      | This is a retained provider-refund path, not the new manual merchant food-refund design. No native path may acquire O after already taking a conflicting shared resource.                                                           |
| Prepaid POS: `apps/api/internal/modules/pos/prepaid.go`, SettlePrepaidOnlineOrder                                                                                | O, L, scoped/revision/replay/refund checks, P, terminal FOR UPDATE, own open shift FOR UPDATE, cart/checkout/sale settlement                                                                                                    | Preserve existing sale/receipt/stock invariants. Native verified handover cannot bypass terminal/shift requirements on this legacy route. The transitive planning graph below expands settlement; runtime lock testing is separate. |
| Kitchen transition: orders.go Transition                                                                                                                         | O, scoped order/revision and payment/hold/refund/reconciliation reads, guarded order UPDATE/event and commit                                                                                                                    | Initial readOrder is not an explicit order FOR UPDATE; inherited O serializes cooperating tenant writers. Do not remove O on the assumption that all state was row-locked.                                                          |
| DB guards: migrations 000018, 000019, 000020, 000021, 000023, 000027, 000028 and 000032                                                                          | Latest 000023 hold/order/refund guards acquire O; 000028 reservation consistency iterates stock requirements in variant order, using 000032 MENU_ONLY-aware requirement functions; queue guards enforce period/counter identity | Include trigger/deferred-constraint effects, FK parent locks and direct database callers in future lock tests. Re-entering an already held O is not evidence of an additional conflicting order.                                    |

Proposed native acquisition order: verified tenant context and O first; routing/compatibility state; scoped order; attempt; shared reservation/benefit resources in stable identity order; restaurant queue serialization and projection; fulfillment projection; append-only events/audit. Pre-authorize before exposing data and recheck authority/revision after external work. Retain O for any operation sharing legacy resources until independent concurrency review accepts a replacement. This deliberately makes no throughput claim; finer-grained locking requires measured evidence and a new reviewed order.

Commit durable external intent before any provider dispatch; never hold transaction locks across provider IO. Finalization reopens a transaction, reacquires the same ordered scope and validates the returned account/amount/currency/identity against intent. Roll back all coupled local effects on failure. Retrying a deadlock/serialization failure replays the same command identity; it must not blindly re-dispatch a potentially successful provider action. Commit ambiguity resolves through durable command/evidence lookup. The transitive planning graph and acceptance cases below cover the affected settlement boundary; they do not prove runtime deadlock freedom or authorize a new writer.

#### Compatibility, backfill and forward-recovery procedure

The following is a proposed runbook. No SQL, database inspection, fixture load, schema application, service startup or cleanup was executed. Do not turn approval of B01 into approval to change existing data.

| Phase                         | Preconditions and planned action                                                                                                                                                                                                                                                                                  | Checkpoint / stop and recovery rule                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Identify target            | Obtain exact task-owned isolated target, runtime/migration roles, owner, data-loss boundary and cleanup permission. Confirm schema version/dirty state and inspect migration/fixture/service effects before running them.                                                                                         | No primary/retained/remote target, auto-discovered DSN or existing volume is assumed disposable. Missing target authority stops execution. Keep credentials out of reports/manifests.                                                                                                           |
| 1. Read-only classification   | On the authorized target, capture a consistent source version/revision manifest and tenant-grouped counts of profiles, Owner memberships, branches, storefront source/readiness, tables, live obligations, payments/holds/refunds, sales/receipts and queue periods/tickets.                                      | Classify explicit one-site mapping, missing context, multiple/ambiguous branch/site or Owner context and absent provider-paid-time evidence. Hash stable non-secret identities/financial invariants without exporting customer data or tracking credentials. Counts are currently unknown.      |
| 2. Additive rehearsal         | Only after separate migration authorization, implement reviewed new storage/constraints alongside schema 39. Keep old source identities, NOT NULL FKs, guards, RLS, permissions and endpoints intact.                                                                                                             | Fresh-upgrade and retained-data rehearsal must both pass. Do not DROP old guards, manufacture operational rows or allocate a migration version before checking current source. Any DDL failure stops dependent steps.                                                                           |
| 3. Resumable mapping/backfill | Persist approved tenant-scoped mapping/provenance and a batch cursor. Use deterministic source keys and revision checks; validate batch results and repeat the same batch without duplicate effects. Bridge only proven same-transaction records.                                                                 | Missing/ambiguous mappings are exceptions, not automatic first-branch selection, restaurant merges or membership deletion. A concurrent source revision change must be re-evaluated rather than overwrite either side. Batch size is measured during rehearsal, not a guessed product constant. |
| 4. Preserve uncertain history | Leave legacy immutable orders/payments/receipts authoritative for legacy transactions. Missing authoritative paid time, handover proof or complete refund evidence remains missing. Record an exception reference without fabricating a native completion/queue entry.                                            | Do not use created_at, event arrival, ticket issuance or POS COMPLETED as substitute native paid/handover evidence. A proposed cutover cannot strand a live paid obligation or duplicate it across queues. B04 governs unresolved paid-time recovery.                                           |
| 5. Compare and constrain      | Validate per-tenant source/bridge/native counts, identity hashes, monetary totals by currency/unit, FK/RLS/unique/check behavior and immutable history. Resolve exceptions before enforcing backfilled mandatory metadata.                                                                                        | No aggregation of unlike units, repair by deleting history or guessed reconciliation. A failed batch/constraint remains failed; preserve cursor/evidence and keep the existing authority/route.                                                                                                 |
| 6. Controlled cutover         | After contract/security/runtime/review gates, select one authoritative writer/route per restaurant transaction origin and record the cutover revision. Legacy records stay available through scoped legacy reads. Compare shadow projections without initiating payment, kitchen work or financial posting twice. | Reject stale cutover context. Reconcile all live payment/hold/kitchen/fulfillment obligations before enabling native writes. Operator-controlled admission routing cannot cancel or stop already paid work. No automatic rollout is authorized here.                                            |
| 7. Recovery                   | Before native writes, revert only the task-owned additive routing change under reviewed control. After native effects exist, retain their storage/evidence, fence new admission when necessary and use forward correction or a compatibility-capable version.                                                     | Never deploy schema-39-only code against incompatible native active obligations, reset retained volumes, drop referenced additive data or rewrite historic payment/receipt rows. Rehearse restart/replay at every batch and cutover boundary.                                                   |

Table compatibility is explicit: keep legacy restaurant_tables and order-table FKs unchanged; native dine-in references restaurant_dining_tables under the same organization. A migration bridge, if needed, records verified physical-table provenance; equal code/name alone is not proof. Persistent QR identifies restaurant/table only; customer/session/tracking proof stays separate, and legacy QR access never grants another customer's history. Native selling routes must use a new reviewed readiness/order path; migration 000039 drafts remain closed until a compatible replacement is accepted, without source_kind conversion.

#### Design-only acceptance boundary

This follow-up completes engineering planning where approved inputs permit it. Planning acceptance checks the documented ownership, transition invariants, affected call/lock paths, compatibility mapping, recovery and executable acceptance specification. It does not require creating the proposed tables or running future-schema tests. T1.2 owns wire contracts and T1.3 owns detailed authority/recovery contracts; their implementation acceptance is not a prerequisite for recording the T1.1 lifecycle design. Undefined authority always denies the affected command.

B04 stays open for equal-paid-time ordering, delayed discovery of an earlier payment and ETA/load targets. Store the evidence needed for that decision, but do not select a tie-break, wait window, priority exception or dispatch completeness rule. This blocks acceptance of that queue policy, not the lifecycle separation, compatibility plan or DB test specification. B02/B03/B09/B12/B14/B15 similarly remain named policy inputs, not permission to guess their values. No planning completion changes the 92 approved requirements or waives later implementation acceptance.

#### Lifecycle vector and transaction boundaries

Model an order as independent payment evidence/attempt history, whole-order kitchen projection and fulfillment projection, plus immutable purchase snapshots and append-only correction/refund evidence. The following are logical states and invariants, not new public enum names.

| Dimension        | Invariant and allowed evolution                                                                                                                                                                                                                     | Independent effects that must not be inferred                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment          | An unresolved attempt may gain authenticated success or authoritative unpaid evidence. Unknown stays unresolved with reservations retained. Verified Paid history and original provider-paid time remain immutable through refunds and corrections. | No kitchen status, merchant slip, browser redirect, POS receipt or handover sets Paid. Do not equate merchant food-refund reports with provider payment reversal or customer receipt.             |
| Kitchen          | No eligible queue work before verified Paid. Whole-order Queued, Preparing and Ready follow approved transitions. Ready-to-Preparing correction before handover appends reason/actor/Before/After and customer notification intent when applicable. | Ready is not fulfillment Completed. No item-level kitchen state, channel priority, auto-pause or rewritten FIFO time. B04 owns dispatch order.                                                    |
| Fulfillment      | Keep channel-specific handover evidence: table delivery for Dine-in, order-specific QR/code for Takeaway/Pickup, customer code for Self-Delivery. Completed requires verified payment and handover evidence with audit.                             | No-Show is separate from Completed, gives no completion points/review rights and causes no automatic refund. Legacy POS COMPLETED is not native handover evidence.                                |
| Amendment/refund | Before Preparing, customer-approved substitution/removal may only keep or reduce the total; preserve original snapshots/FIFO identity and append deltas/refund references. Full/partial refunds remain linked records.                              | No routine amendment after Preparing, unilateral menu replacement, extra charge, automatic merchant food refund or deletion of prior payment/receipt evidence. B09 owns exact benefit allocation. |

Client commands use expected projection revisions and a scoped command fingerprint. Provider observations use authenticated provider/event identity, durable evidence deduplication and the locked current attempt; they do not require a browser's expected revision. Both paths re-read eligibility under the transaction lock and save their local effects atomically. An authorized matching command replay returns its recorded result; stale or changed commands cannot repeat effects. A revoked actor or wrong guest proof cannot read a cached result.

| Transaction boundary         | Records and checks committed together                                                                                                                                                                                                          | Interruption / race outcome to verify                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter Payment                | Revalidate price/options and main/modifier quota; reserve applicable quota/coupon/points atomically with immutable order/attempt intent and replay result. Cart save alone has no reservation.                                                 | One exhausted resource rolls back every reservation/intent. Concurrent attempts on the same order cannot both remain chargeable. B03/B14 supply duration and allocation details.                     |
| Dispatch / observe           | Commit durable provider intent before IO. After IO, reacquire scope, validate intent/account/amount/currency and append evidence with attempt/projection/audit and applicable local reservation effects.                                       | Lost response uses the same intent and query/reconciliation. Verified Paid evidence is retained even when current kitchen eligibility fails; legacy released holds stay released and require review. |
| Kitchen command / correction | Scope Owner and order, lock current payment/eligibility and kitchen/fulfillment projections, compare revision, append transition/audit and notification intent.                                                                                | Race with refund/reconciliation or verified handover resolves under the shared lock. The losing stale/ineligible command has no kitchen effect. Post-handover correction needs Admin review.         |
| Verify handover              | Check channel proof and current payment/fulfillment eligibility; consume proof replay-safely, append handover/audit and mark fulfillment Completed together. Record downstream benefit/notification intent in the same commit when applicable. | Duplicate proof/command cannot create a second completion or benefit. Ready/No-Show alone cannot grant completion. Exact proof and post-completion benefit contracts remain T1.2/T1.3/T6.5.          |
| Amendment / refund / No-Show | Check permitted actor, lifecycle and relevant customer approval/evidence; append linked delta/refund/No-Show history and coupled benefit/reservation/audit effects.                                                                            | No snapshot or paid-time rewrite. Refund report, customer dispute and receipt confirmation remain distinguishable; B07/B09/B15 policy values stay open.                                              |

Notification intent means an atomic durable record for post-commit delivery, not network delivery inside the transaction or approval of a new messaging service. Retries deduplicate that intent. The design does not promise notification delivery merely because the business transaction committed.

#### Transitive planning graph and direct-writer contract

This graph expands the nine observed groups above through the affected legacy prepaid settlement, payment evidence and shared-ledger boundary. It is a source-level call/resource graph, including conditional edges and implicit write/unique/FK effects. It is not a total query-plan acquisition order, a claim that every SELECT locks rows, or a runtime deadlock proof. Reads without explicit locking remain reads. Retain O across cooperating legacy writers; do not transplant their downstream order as a new native API contract.

| Path / source evidence                                                                                                                                                                             | Expanded resource edges and transaction end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepaid entry: `apps/api/internal/modules/pos/prepaid.go`, `service.go`, `carts.go`, `checkouts.go`                                                                                                | Organization.Authorized acquires O; then L, P, terminal, own shift, inserted cart/items and cartHeader FOR UPDATE; inserted checkout then checkout FOR UPDATE. Reused terminal/shift/cart locks in settle stay in this transaction. Unique prepaid-order/checkout keys and scoped parent FKs also participate.                                                                                                                                                                                                                                              |
| Settlement validation: `apps/api/internal/modules/pos/sales.go`, `pricing.go`, `customers.go`; `apps/api/internal/modules/customers/service.go`; `apps/api/internal/modules/loyalty/redemption.go` | settle calls terminal, ownShift, cartHeader, revalidate and validateReward. Conditional customer selection takes FOR SHARE; approved discount validation takes discount approval FOR UPDATE; a non-nil loyalty reward locks account FOR UPDATE and program/customer FOR SHARE. These validation locks precede movement posting.                                                                                                                                                                                                                             |
| Inventory: `apps/api/internal/modules/inventory/sales.go`, `service.go`; migrations 000005, 000013, 000028                                                                                         | BeginSale inserts/replays an inventory operation. settle inserts sale/items, then PostSale sorts movement input by variant identity and inserts stock_movements. inventory_apply_movement upserts and locks aggregate stock balance FOR UPDATE; quality_apply_movement takes O, optional batch FOR SHARE, then quality balance FOR UPDATE; inventory_reservation_guard takes O and checks reserved availability. Include all same-statement triggers and parent keys; do not infer their execution order from source listing.                               |
| Pricing and loyalty posting: `apps/api/internal/modules/pricing/approvals.go`; `apps/api/internal/modules/loyalty/posting.go`; migrations 000010, 000012                                           | After movements, pricing.Redeem inserts promotion_redemptions; its trigger updates promotion usage (a write lock), and an approval may be updated to CONSUMED. loyalty.PostSale locks account FOR UPDATE and program/customer FOR SHARE when a matching account exists, then inserts immutable ledger entries; the ledger guard re-locks the account. Pre-validation may already hold those resources. MENU_ONLY does not remove every POS or ledger dependency.                                                                                            |
| Sale completion: `apps/api/internal/modules/pos/sales.go`, `online_orders.go`, `service.go`; migrations 000006, 000010, 000012, 000020, 000032                                                     | Insert payment/receipt; settlement insert guards read checkout FOR SHARE. Update cart/checkout, then completeOnlineOrder updates L and appends event/audit; CompleteSale updates inventory operation result. settle forces sale_consistency, pricing_sale_consistency and online_order_consistent immediate when applicable. Other deferred constraints, including prepaid-order, stock-policy and loyalty consistency, still run by commit. finish records audit then commits; any failed constraint rolls back the transaction.                           |
| Webhook: `apps/api/internal/modules/storefront/payments.go`; migrations 000017, 000019, 000023                                                                                                     | VerifyCustomerEvent and validate purpose/tenant/order before paymentTx; paymentTx sets context and takes O, readPayment takes P. Validate frozen session, compare inbox fingerprint, insert inbox under unique event key, observePayment updates attempt, then commit. Attempt/hold guards preserve evidence and irreversible release. This path does not itself allocate native queue dispatch or prove real provider paid-time completeness.                                                                                                              |
| Query/create evidence: `apps/api/internal/modules/storefront/payment_checkout.go`; migration 000019                                                                                                | Prepare dispatch under O/P and commit; external IO has no open local transaction. Observation phase takes O/P, appends immutable observation and updates attempt before commit. Dispatch/observation guards re-enter O and validate frozen intent; the observation-to-session FK is deferred. Account/intent validation and same-intent recovery precede any retry.                                                                                                                                                                                         |
| Staff reconciliation/refund: `apps/api/internal/modules/storefront/payment_reconciliation.go`, `payment_refunds.go`; migrations 000021, 000023                                                     | staffPaymentTx takes O, L and P with permission/branch checks; refund preparation/finalization additionally reads refund FOR UPDATE. IO separates the prepare/finalize transactions. Refund observation/intent, attempt hold, order cancellation, event and audit commit together; deferred online_refund_consistent checks successful refund implies cancellation/release. Checkout review/refund guards re-enter O and can reject settlement. This full-provider legacy cancellation is not the approved native manual full/partial food-refund contract. |
| Reservation and queue: migrations 000015, 000027, 000028, 000032; `apps/api/internal/modules/restaurant/queue.go`                                                                                  | Reservation consistency's active body is 000028, iterating stock requirements by variant; 000032 supplies MENU_ONLY-aware requirement functions. Legacy queue allocation takes org/branch advisory Q, reads period, upserts period counter and inserts unique ticket. Preserve rollover/period guards. Native queue serialization is restaurant-wide; its paid-time dispatch rule remains B04.                                                                                                                                                              |

The native planning order remains O, routing generation, scoped order, attempt, applicable shared resources in a stable identity order, restaurant queue/projection, fulfillment and append-only effects. Every command locks only its required subset but cannot acquire an earlier shared resource after a later one. A route reusing legacy settlement invokes the legacy sequence while already holding O; native code must not remove O or combine the two resource sequences speculatively. Standalone native orders do not invoke POS settlement merely to record handover.

Direct-writer boundary: inspected Go entry helpers in inventory, purchasing, returns, pricing, loyalty, restaurant, POS and storefront use Organization.Authorized, or explicit public/payment tenant transactions, before affected writes. Inventory/loyalty/pricing posting helpers accept an existing transaction and inherit the caller's obligations; their names do not establish independent authorization. Runtime SQL privileges and maintenance/test callers are a distinct boundary. A direct UPDATE may already hold its target row before an O-taking trigger runs; trigger re-entry alone cannot prove O-first ordering. Future worker/import/backfill/direct-SQL callers must acquire the same scoped O first, use approved runtime authority, and avoid touching multiple organizations in one business transaction. No role/grant change is made here. DB-10 below must exercise an adversarial direct writer; any actual inversion is an implementation finding, not justification to disable a guard.

Constraint closure is part of the graph: immediate checks, immutable guards, unique conflict waits, FK parent-key checks and all pending deferred constraints must finish before success is acknowledged. For the retained path, active definitions must be resolved in migration order (notably 000019/000023 payment guards, 000028 reservations and 000032 sale/stock policy). A future migration adds an edge only after re-reviewing this boundary. Unknown deployed code, roles and externally managed direct SQL are future execution preflight inputs; this source graph does not assert they match the repository.

#### Compatibility mapping and resumable backfill contract

The eight-phase runbook above is supplemented by these mapping rules. Mapping metadata is a proposed logical record, not a new migration or permission to copy retained data. Each record carries tenant, source kind/key, target key if any, source revision/hash, mapping generation, disposition and reason. Dispositions distinguish mapped, retained-only and needs-resolution; none authorizes deleting an exception.

| Source classification                                        | Mapping / readiness rule                                                                                                                                                                          | Invariant across restart and cutover                                                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing organization/profile with verified one-site context | Reuse organization identity. Reference the existing profile; do not create a second restaurant merely to assign a native order root.                                                              | Organization/Owner/location provenance is unchanged. Multiple legacy active Owners or incompatible sites enter needs-resolution for T1.3/approved data handling; no membership deletion or merge.                  |
| Restaurant draft with source_kind RESTAURANT                 | Retain the existing draft and its closed guards. A separate native selling-readiness/order path references the same organization only after verification and service/provider prerequisites pass. | No source_kind flip, fake terminal, or publication through the legacy storefront route. Setup completion and native selling readiness remain separate.                                                             |
| Legacy branch-linked storefront/order/payment                | Keep original branch/terminal/location/source and financial evidence authoritative. A legacy caller adapter accepts only an explicitly verified same-tenant mapping, not a first-branch default.  | No native order is required for historical display. A one-to-one bridge is optional only for a proven same transaction; branch identity never becomes a second native restaurant queue.                            |
| Dining table / QR                                            | Keep restaurant_tables and legacy order FKs. A native restaurant_dining_tables mapping requires verified physical-table provenance and organization context.                                      | Matching labels do not establish identity. Persistent table QR carries no customer history authority; session/order proof stays separate. Do not rotate or repurpose an existing customer proof as table identity. |
| Payment / kitchen / fulfillment history                      | Retain provenance and original paid-time evidence. Bridge paid/active work only when the live obligation and its owning writer/projection can be reconciled without duplicate execution.          | Missing paid time or handover remains missing. Do not synthesize native Completed from POS status; do not dispatch bridged work twice. B04-dependent dispatch remains disabled until its policy is settled.        |
| Financial / benefit / receipt history                        | Leave stock, sale, payment, receipt, refund, promotion and points entries in their original ledger. New native effects reference their own origin and approved rules.                             | Never replay an old sale into a new ledger as backfill, net unlike units/currencies together, or erase an outstanding obligation. Shadow comparison performs no charge, refund, earn or dispatch.                  |

Resumable batch protocol: identify a finite tenant/source range using stable source keys; record the inspected source revision/hash and mapping generation. A batch takes the applicable tenant serialization before reading/writing task-owned mapping metadata, rechecks the source version, writes mappings and checkpoint atomically, and resumes from the last committed checkpoint. A changed source is reclassified, not overwritten. Crash before commit leaves neither mapping nor checkpoint; crash after commit replays the same mapping identity without duplicate effects. Pending live obligations must be rescanned and reconciled at cutover even if their older batch completed. Batch sizing, exact schema and source-specific version representation are implementation details to verify, not product constants chosen here.

Cutover admission uses a tenant-scoped route generation and one writer per transaction origin. Capture the expected generation in the command identity; stale commands fail before new effects. Payment callbacks/reconciliation for existing attempts must still reach their owning evidence handler after admission changes. Keep legacy active work and historical reads available while native admission is fenced or disabled. A native handover cannot settle a legacy sale implicitly; a compatibility route must invoke the accepted legacy settlement flow explicitly. Reverting new admission does not discard already committed native work, evidence or callbacks. Recovery uses compatible readers/writers or forward correction, preserving both origin and immutable history.

#### Database acceptance specification, not execution

These cases are the design deliverable. Every runtime result below is NOT RUN. Executing them requires separately authorized implementation and confirmed isolated task-owned targets. Their absence is not a failed documentation check. This plan preserves mandatory DB/runtime acceptance for T2.2/T2.3/T5; it does not relabel static review as that acceptance.

Execution preflight must name two task-owned targets: a fresh schema-39 upgrade baseline and a retained-shape schema-39 baseline using synthetic or separately authorized sanitized fixtures. Confirm exact host/database/container or volume identity, owner, migration/runtime roles, source revision, current version/dirty state, migration/fixture effects, recovery and cleanup boundary. Never infer disposability from a DSN, service name, default volume or the old handoff's target. No credentials or customer/tracking proofs belong in evidence. Inspect the selected harness before choosing exact commands; new-schema tests do not exist yet.

| Case                                    | Fixture / action to implement later                                                                                                                                                                                           | Required observable result                                                                                                                                                                                                                                                                                                | Dependency                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DB-01 Fresh/additive upgrade            | Upgrade a clean schema-39 fixture with the reviewed native slice. Repeat version/dirty checks and runtime-role connection.                                                                                                    | Reviewed target version, clean state, expected scoped keys/RLS/grants and unchanged applied migrations. RESTAURANT drafts remain closed through legacy routes.                                                                                                                                                            | T2.2 implementation and target authorization                         |
| DB-02 Retained classifications          | Include one-site, multiple legacy branches/Owners, legacy open/paid/unknown/refund obligations, closed drafts and both table families. Compare before/after manifests.                                                        | Proven mappings only; ambiguous data stays needs-resolution/retained-only. Tenant-separated identity counts and exact financial totals by currency/unit match; no deleted membership/history or fake infrastructure.                                                                                                      | T2.2; T1.3 for accepted exception resolution                         |
| DB-03 Tenant and authority denial       | Use runtime role with missing/foreign tenant context, wrong actor/guest proof, foreign parent keys and cross-restaurant bridge/payment/handover references. Exercise reads, writes and replay responses.                      | No protected data or business effects; scoped FK/RLS/authority checks reject invalid context. Owner of one organization gains no access to another by selecting its identifier.                                                                                                                                           | T1.3 and selected contract implementation                            |
| DB-04 Command replay / stale revision   | Retry matching command; race identical commands; send changed payload under same key and stale projection revisions. Revoke proof before cached-result replay.                                                                | One committed effect/result for valid replay; changed/stale/revoked commands cannot mutate or disclose cached protected data. No duplicate order, attempt, kitchen or handover effect.                                                                                                                                    | T1.2/T1.3 and native command implementation                          |
| DB-05 Atomic payment-entry reservation  | Race limited main menu/modifier quotas and coupon/points reservations. Force one resource to fail. Save a cart without entering Payment.                                                                                      | No oversell or partial reservation/order intent. Cart save reserves nothing. Unknown payment retains every coupled reservation; confirmed unpaid follows the approved release rule.                                                                                                                                       | B03/B09/B14 parameters and selected implementation                   |
| DB-06 Provider observation races        | Authenticate callback/query outcomes; race duplicate and conflicting observations and lose a dispatch response after provider acceptance.                                                                                     | Preserve immutable evidence/fingerprints, one valid projection effect and same-intent recovery. Mismatched account/amount/currency/session cannot mark Paid. Unknown never permits unsafe re-charge or release.                                                                                                           | B02/B03 evidence contract and implementation                         |
| DB-07 Late Paid / legacy hold release   | Deliver trusted Paid evidence after a legacy irreversible hold release, then attempt kitchen progression and settlement.                                                                                                      | Evidence retained, hold not restored, kitchen/settlement denied under retained eligibility and routed to review. This does not test or choose B04 dispatch order.                                                                                                                                                         | Retained-path regression; native recovery contract when implemented  |
| DB-08 Kitchen / refund / handover races | Race kitchen command with refund/reconciliation; race Ready correction with verified handover; duplicate channel proof.                                                                                                       | Re-read eligibility under scope lock; no ineligible kitchen effect, second handover or post-handover Owner rewrite. Payment/FIFO/snapshot/audit history unchanged; No-Show alone grants no completion benefit.                                                                                                            | T1.2/T1.3; B09/B15 where policy affects the case                     |
| DB-09 Legacy settlement closure         | Run accepted prepaid and tracked/MENU_ONLY regressions through checkout, inventory, pricing/loyalty where applicable, payment/receipt and order completion. Force immediate/deferred constraint failure.                      | Coupled records commit once or roll back together. MENU_ONLY has no stock movement but retains accepted POS constraints; native verified handover does not call this path implicitly.                                                                                                                                     | Existing legacy fixtures plus T2.2 compatibility slice               |
| DB-10 Locks / direct writers            | Use independent connections and barriers for same-tenant payment/refund/settlement and shared-resource writers; also test different tenants. Include an authorized direct-SQL transaction that attempts reversed acquisition. | Capture resource/transaction ordering and bounded failure/retry outcome. Cooperating O-first operations preserve invariants; any reversed-order deadlock is surfaced and safely rolled back, never silently accepted as a compliant caller. No claim of cross-tenant serialization or deadlock freedom from source alone. | Reviewed caller contract and isolated concurrency harness            |
| DB-11 B04 dispatch and ETA              | Equal paid times, delayed earlier-paid observation after later work exists, channel mix, rollover with unfinished work, recovery replay and ETA/load fixtures.                                                                | Expected order, completeness/recovery behavior and measurable ETA/load thresholds must be supplied by accepted B04/provider evidence before execution. No invented tie-break or timing assertion.                                                                                                                         | DEFERRED: B04, affected B02 and load targets                         |
| DB-12 Backfill crash / drift            | Interrupt before/after a batch commit; replay checkpoint; change source revision mid-batch; resume and rescan live obligations.                                                                                               | Mapping/checkpoint atomicity, no duplicate bridge/effect, drift reclassification and unchanged source history. Cutover refuses unresolved live-obligation discrepancies.                                                                                                                                                  | Mapping implementation and authorized retained-shape fixture         |
| DB-13 Cutover / callback ownership      | Race route-generation change with admission; deliver callback for pre-cutover attempt; compare shadow projection and active queue identities.                                                                                 | Stale admission rejected before effects; callback reaches original evidence owner; exactly one active execution authority per transaction, no duplicate queue/payment/benefit and no stranded paid work.                                                                                                                  | Route/contract implementation; B04 only for policy-specific dispatch |
| DB-14 Recovery / rollback refusal       | Rehearse empty-target reapply where supported; interrupt additive upgrade/cutover; attempt populated destructive rollback; recover with native obligations present.                                                           | Populated destructive rollback refused; dirty/partial states reported and recovered through reviewed forward steps. No retained reset, lost callback/history or schema-39-only fallback over incompatible active native records.                                                                                          | T2.3 implementation and explicit owned cleanup boundary              |

Evidence for each executed case must record case ID, source/target version, fixture class, actual runtime role, action/result, invariant counts/hashes, transaction/race ordering where applicable, failures and task-owned cleanup outcome. Report NOT RUN/BLOCKED separately from FAIL; a test filename, static SQL assertion, successful build or historical run supplies none of these runtime results. Existing storefront payment, hold, reconciliation, prepaid and queue tests are retained-path seams only. Native cases need their own tests when implementation is authorized.

<a id="d02"></a>

## D02. Restaurant ownership, onboarding and availability

Covers: VLP-007, VLP-009, VLP-010, VLP-018, VLP-032, VLP-034, VLP-065.
Owners manage independent restaurants. Each restaurant has exactly one physical
location, one primary market and one active Owner. Multi-community discovery
uses approved associations to the same restaurant, never duplicate restaurants,
locations, queues or financial accounts.

Separate editable setup, Admin evidence review, approval and ability to sell.
An owner may prepare a menu while awaiting approval; completing setup is not
Admin approval. Verify identity/site and the relationship to the receiving
account. Sensitive changes require re-verification before activation. Accepted
merchant documents and review rules remain TBD; do not impose universal business
or tax registration on every restaurant.

Model Dine-in, Takeaway, Pickup and self-Delivery as the four approved modes.
Scheduled opening hours combine with Owner global and per-mode pause. Paid
obligations continue while new ordering is paused. Pause must not release unknown
payment reservations or cancel paid orders. Table QR binds restaurant/table;
private customer session data never lives in the persistent public QR. Separate
orders/payments on the same table remain independent FIFO entries.

### Native order availability contract (T1.2 proposal)

This contract advances VLP-007 and VLP-032. It does not grant permission to sell.
The existing `/organizations/{id}/restaurant/setup` routes save setup flags;
`/organizations/{id}/storefront` owns the legacy `accepting_orders` switch.
The public storefront quote and order routes use `fulfillment` and an optional
table token. The legacy `PICKUP` value covers more than native Pickup, so its
meaning must stay unchanged. The setup wizard, storefront settings, public
catalog and cart use those existing shapes. Keep them intact until a native
consumer and producer pass compatibility checks.

- **Owner settings.** A native availability read returns the restaurant's time
  zone, weekly ordering windows, global pause, four per-mode pause flags and a
  revision. A write replaces those settings as one unit, with the expected
  revision, using the existing verified Owner write boundary. Stale revision
  conflicts, invalid schedules and foreign writes have no effect. Save the new
  revision and audit in the same transaction. Keep these operational settings
  editable after setup without reopening or mutating completed setup records.
- **Ordering windows.** Proposed representation: ISO weekdays 1-7 and local
  `HH:mm` boundaries in the restaurant's explicit IANA time zone. Start is
  inclusive and end exclusive. A day without windows is closed; use `24:00`
  only as an end boundary and split overnight windows at midnight. Reject
  unknown zones, invalid weekdays, empty or reversed intervals and overlaps;
  touching intervals are valid. Evaluate a trusted server instant in the stored
  zone, independent of client clocks and the server host's local zone. Do not
  infer opening hours from the old branch closing time. Keep unpublished native
  configuration separate from the live legacy storefront during transition.
- **Public result.** Use an explicit native mode (`DINE_IN`, `TAKEAWAY`,
  `PICKUP`, `DELIVERY`). For a discoverable restaurant, expose only evaluated
  per-mode availability and a safe denial reason; omit owner settings, evidence
  and private table data. A mode can admit a new order only when the restaurant
  can sell, the mode is enabled, its current window is open, and neither pause
  applies. A quote is advisory. At new order admission re-evaluate under the
  restaurant transaction's serialization boundary with settings updates, using
  a server instant captured after acquiring that boundary. All four modes must
  use the same predicate. A denial must create no order or payment side effects.
- **Existing obligations.** A matching authenticated replay (or replay with the
  required guest proof) returns an already committed result without admitting
  another order; a changed request still conflicts. Closing or pausing cannot
  cancel a paid order, remove a paid queue entry, stop verified reconciliation or
  release a hold for an unknown payment. Starting a new payment attempt for an
  already created unpaid order, with no pending attempt, must be specified with
  T3.2/T3.3 and B03 before changing any payment entry point.

Acceptance: test inside/outside windows, exact boundaries, overnight split,
empty schedules and differing host/restaurant zones; all four modes, individual
and global pause/resume, and no selling before approval; cross-restaurant denial,
stale revision and audit rollback; both serialized outcomes of a pause racing
with admission, a stale quote, a proved replay after pause, and existing paid or
unknown-payment work continuing. Verify legacy settings, quote, order and
tracking compatibility. Exact routes, DTO names and status/code mapping must
land with their real Go producer, OpenAPI, route inventory and React consumer.
No runtime path or migration is introduced by this proposal.

### Selected setup-only Pickup contract - 2026-11-22

The first local implementation slice adds durable organization-native Pickup
configuration during editable setup. It advances VLP-032 without establishing
approval, payment readiness, public ordering or operational pause. Existing
verified Owner authorization, tenant locks, audit and completed-setup refusal
remain the authority boundary for this slice. Target MFA/recovery acceptance
remains separate T1.3/T6.4 work.

`RestaurantServiceModes` keeps the existing three booleans and accepts optional
Boolean `pickup` on organization profile/services setup. Omission preserves the
stored Pickup value; explicit false disables it. Services validation uses the
effective four-mode state inside the authorized transaction. Profile input with
all three old flags false and Pickup omitted retains its existing service no-op.
Supplying Pickup on explicit legacy branch setup is rejected, including false;
legacy requests/responses and the public `PICKUP`/table-token transport retain
their established meaning. JSON null is not an accepted Boolean value.

Presence must survive fingerprinting: absent Pickup must marshal exactly as
before, including field order, while explicit false differs from omission.
Historical command results remain immutable. Organization replay may project
missing Pickup as false from the historical schema default, never current state.
Organization reads expose a Boolean; legacy branch projections omit the field.
Existing clients may omit it without resetting a configured value.

Add `restaurant_profiles.pickup` as a non-null opt-in Boolean, initially false
for both new and retained profiles. Do not derive it from Takeaway or overwrite
existing flags. Extend only the completed-profile service-mode CHECK to include
Pickup, preserving all saved-step, payment and timestamp prerequisites. Preserve
RLS, grants and legacy data. Allocate the next unused migration version and pair
it with server readiness; old server/schema combinations are not accepted.
Downgrade must refuse whenever any profile has Pickup enabled, including an
incomplete profile. Recovery keeps the applied schema/data and uses a forward fix.
The downgrade sets transaction-local `row_security=off` before its guard query.
This makes a migration owner without BYPASSRLS fail when FORCE RLS would hide
rows; it does not disable RLS or alter table policies.

Acceptance covers independent flags, Pickup-only completion, omitted/false/null
inputs, old fingerprints/results, identical/concurrent replay, changed-payload
conflicts, denied access, validation rollback, completed immutability, fresh and
retained upgrade, populated downgrade refusal and preservation of private drafts.
No public checkout, payment, queue, quote, table-token or authorization control
is changed. Browser/UI rollout and per-mode runtime availability are later slices.

### Native table QR and private session boundary (T1.2 proposal)

VLP-018 gives the persistent QR authority to identify a restaurant and
table. Scanning opens the public menu and lets the customer choose Dine-in
or Takeaway. The QR must not read or resume a previous cart, session, order
or payment. A new Dine-in session uses separate private proof, bound on the
server to that organization and native dining table. The same QR can start
independent sessions at the same table. Orders and payment attempts keep
their own identity and queue positions; a table identifier is not an
idempotency key. Choosing Takeaway from the QR does not carry a Dine-in table
assignment.

The setup producer in `organization_setup.go` writes
`restaurant_dining_tables` and returns issued QR values to the Owner setup
UI in `OrganizationPages.tsx`. The legacy `dineInTable` reader in
`storefront/orders.go` resolves `table_token` against branch-scoped
`restaurant_tables`. `ShopCatalog.tsx` and `ShopCartPage.tsx` consume
that legacy token and the cart pairs it with legacy `PICKUP`. Keep the
legacy reader, UI and order foreign keys in service. The native flow uses the
organization-scoped dining table; a matching code or name cannot link the two
table families.

The public projection must omit private session, cart, order and payment
state. A native Dine-in mutation must validate both the table context and
the matching private session proof at the server. Keep Dine-in sessions out
of saved-cart sync/recovery and reorder.

| Operation | Authority and result |
| --- | --- |
| Resolve QR | The public QR resolves only against an active native table in the addressed restaurant, and returns public table/menu context. Repeated scans do not resume or close another session. |
| Start Dine-in | An explicit start from that QR creates an independent server-side session and issues its private proof. An explicit Takeaway choice skips this operation. |
| Read or change session state | Require matching private proof, organization, table and session state in the transaction. The server derives the table assignment from the validated session; caller-provided IDs do not grant access. Missing, foreign, expired and ended proofs get the same denial and no private payload. |
| End or expire | End the session without releasing reservations, altering committed orders, or changing queue entries. Once ended or expired, it cannot open another order. Customers use the separate order proof for committed obligations; the QR cannot recover that proof. |

For the first wire contract, propose a server-generated opaque proof with
256 bits of randomness, returned only at session creation and submitted in
the body of private POST requests. This follows the existing storefront
tracking pattern without reusing order tracking proof or introducing a
browser-wide ambient cookie. Responses that issue proof or return private
state are non-cacheable. Keep proof out of URLs, logs, analytics and shared
cart caches. Store only its digest server-side. Scope the persisted session
to a composite organization/table reference, and bind any private cart or
command replay to the session as well as the organization. A lookup by
restaurant/table alone never selects a customer's session. Recheck lifecycle
and scoped proof before returning a replay or creating new work.

#### Proposed v1 paths and payloads

The base path is `/api/v1/storefronts/{slug}`. Resolve the slug through the
published storefront and the deployment's organization scope before querying
native dining tables. Use the canonical slug to load the existing public menu
separately. The legacy `table_token` parameter on `/quote` and `/orders` keeps
its existing meaning and is not accepted as native session proof.

| POST path | JSON request | Success response |
| --- | --- | --- |
| `/table-qr/resolve` | `{"qr_token":"..."}` | `200`, `{"data":{"table":{"code":"...","name":"..."}}}`. Does not create, select or end a session. |
| `/table-sessions` | `{"qr_token":"..."}` | `201`, `{"data":{"table":{"code":"...","name":"..."},"session_proof":"...","expires_at":"..."}}`. Call only on explicit Dine-in selection; recheck QR and Dine-in admission in the write transaction. |
| `/table-sessions/end` | `{"session_proof":"..."}` | `204`, empty body. End only the session selected by this proof within the addressed restaurant. |

`qr_token` uses the existing 64 lowercase hexadecimal character format.
`session_proof` is an independently generated 32-byte value encoded as
unpadded base64url (43 characters); `expires_at` is the server's deadline
in UTC RFC 3339 format. No internal table/session identifiers are returned.
Reject malformed JSON, unknown fields and wrong field types with the existing
`400 INVALID_INPUT` envelope. On a valid JSON object, an absent or unusable
credential, unknown shop, or wrong scope returns the uniform `404 NOT_FOUND`
envelope. Ended and expired proofs get the same denial. A matching QR whose
table is public but cannot admit a new Dine-in session returns `409 STORE_CLOSED`
on start. Apply `Cache-Control: no-store` before validation or rate limiting
on all three paths, including errors. Bound request size and reuse storefront
public write middleware before lookups or writes: disallowed origins return
`403 INVALID_ORIGIN`; throttling returns `429 RATE_LIMITED` with `Retry-After`.
Never log credential values.

The existing limiter persists its scope in `auth_rate_limits`, whose check
constraint enumerates supported scopes. Add and verify separate scope values
for resolve, start and end before mounting the paths; reusing the legacy
quote/order buckets would couple unrelated customer actions. Verify that
rate limiting happens before session access and that the new buckets leave
the retained quote, order, tracking and payment buckets unchanged.

Each successful explicit start creates one session. The client submits once
per choice and does not automatically retry an ambiguous start. A customer
may explicitly start again if the response was lost: this never recovers the
lost proof or ends any other session. An abandoned session expires and cannot
hold inventory, quota, benefits or payment by itself. A newer session is never
inferred from the QR, even when it is the only active session at that table.

A future native quote or checkout takes `session_proof` in its JSON body for
`DINE_IN` and derives the table from the session; it does not take a QR or an
editable table ID as authority. A `TAKEAWAY` request does not take a session
proof or assign a table. Ending a session and admitting an order serialize on
the scoped session: if end wins, no order is admitted; if admission commits
first, its order, payment and queue state stay intact. Use separate order
proof for payment recovery, without checking the dining session.

#### Proposed persistence and transaction checks

- Reference the native table with `(organization_id, table_id)`, using the
  existing unique `(organization_id, id)` on `restaurant_dining_tables`.
  Enforce organization scope on both reads and writes through the runtime
  role. Use an indexed `(organization_id, proof_digest)` lookup; store a
  digest of the decoded proof, never a recoverable copy. Do not make the table
  unique in the session store: it can have more than one active session.
- Follow the existing storefront write order: acquire the organization lock
  before any session lock. Recheck start eligibility after obtaining that lock;
  a QR resolved before a concurrent setup change is not evidence for a later
  write. End and checkout admission must lock the same scoped session row
  and read its current state after the wait. No writer should hold a session
  lock and then request the organization lock.
- Compare the expiry deadline with the database wall clock after lock waits
  and before admitting work, not with the transaction start timestamp. An
  admission waiting past expiry must return no result and create no order,
  payment attempt or reservations. An already committed attempt remains
  recoverable only through its order proof. Do not copy the session proof
  into order snapshots, payment records or replay results.

The remaining decisions are whether a reload restores the session in the
same tab or requires a new start; the session lifetime; and whether closing
a table, disabling QR or rotating it also ends existing sessions. Resolve is
subject to the current table and QR configuration in every case. Same-tab
recovery, if selected, must prove possession of the current session and must
be separate from the QR landing flow. A fresh scan, browser tab opened from
a QR link, or explicit Takeaway selection cannot recover a previous session.
Keep saved-cart expiry and concurrency under B14. Review the authority and
contract under T1.3 before adding the Go producer, web consumer, OpenAPI or
migration.

Acceptance must cover repeated and concurrent starts, independent sessions
and orders for the same table, Takeaway without a table assignment, missing
or mismatched proof, expiry/end racing new admission, proof-free public
projections, and retained legacy QR behavior. With isolated fixtures, show
that denial leaves the other session and its records unchanged and that
ending the session preserves committed order/payment/queue state.
This proposal does not register a route or add a migration.

<a id="d03"></a>

## D03. Menu, revisions and import

Covers: VLP-008, VLP-091, VLP-092.
Menu categories/items carry current prices, required/optional modifier groups,
extra prices, topping availability and optional dish/option quotas. Ingredient
recipes and stock deduction are not required for the approved restaurant flow;
existing retail dependencies remain compatible until replaced and accepted.

Keep immutable purchase snapshots, including options, discounts and actual
amounts. Menu/price/option/availability changes record Before/After, actor and
time. Restoring an old version appends a new revision. It never edits historical
paid orders or earlier audit records. Pending carts/checkout revalidate current
version, prices and quotas.

CSV/Excel import includes template validation, preview, duplicate detection,
add/change/error outcomes and bulk price/category/sale-status edits. Authorize
and scope both preview and apply; append revisions and import audit. Template
schema, size limits and all-or-nothing versus partial-apply behavior remain TBD
before T3.9 implementation. Existing catalog import is a reuse seam, not proof
of modifier-aware restaurant import. Scope 93 menu media management is excluded;
existing image fields do not approve it.

### Modifier ownership and revision boundary

The existing organization menu registry keys a sellable item by restaurant
and variant. Keep that identity for modifier ownership; do not attach groups
to a display name, SKU, category or arbitrary legacy product. A group belongs
to one registered item and an option belongs to one group. Persist stable IDs
and require the full restaurant/item/group relationship for edits and for
validating a customer selection. Resolve IDs in the current restaurant before
reporting field or revision errors so a foreign reference gives no details
about the other restaurant.

Use a separate Owner menu command for modifiers. The existing setup save
accepts category/item rows without any modifier data; treating those missing
fields as an empty replacement list would erase configuration on a retained
client save or replay. Preserve groups and options when setup edits a name,
price or category. Owner reads include inactive options for management, while
the customer view exposes only sellable choices. Changing sale status does not
delete the option or make an older snapshot unreadable.

Use one base menu revision across writes that change customer choices,
prices or availability. In particular, the existing item writer and future
bulk-import writer must participate in the same revision boundary before any
client can depend on it. A write under the current restaurant and live Owner
authority validates the final choice bounds, appends before/after history and
audit, then commits together. An old base revision conflicts without writing;
an exact retry may return its original result only after current authorization
is checked. A restore appends a new revision. It does not reactivate historical
orders or rewrite purchase snapshots.

For checkout, validate distinct selected options against their own item and
group, required/optional bounds, current sale status and exact extra prices
on the server. A stale price or unavailable choice requires the customer to
reconfirm; never silently substitute another choice. Binding the resulting
snapshot to an order and reserving main/option quantities at payment remains
the separate T3.2/T3.7 transaction. This boundary selects no quota hold duration
or allocation policy and makes no changes to legacy recipes or stock.

Acceptance includes a retained setup save preserving configured choices,
foreign and wrong-parent references returning no details, stale edits and
audit failure writing nothing, disabled choices requiring reconfirmation in a
pending cart, and paid snapshots staying unchanged after edit or restore.
This defines the design boundary; no HTTP path, wire payload or schema is
published by this checkpoint.

### Native menu modifier wire proposal (T1.2)

This proposal covers VLP-008, the choice and price portions of VLP-079, and
the revision and snapshot boundary of VLP-091. It does not change the
retained setup, catalog, or quote payloads. A native producer and consumer
must implement the contract together before any route is published.
The retained `storefront.ItemInput` carries `variant_id` and `quantity`,
and `normalizeItems` rejects a second line with the same variant. Keep that
behavior for existing consumers; the native path must distinguish lines by
item and selection rather than using the variant alone.

| Operation | Proposed wire behavior |
| --- | --- |
| Read for Owner | Under the current restaurant and verified Owner authority, return the menu revision and the addressed item's groups and options, including inactive options. Each group has a stable ID, label, and integer minimum and maximum choices; each option has a stable ID, label, exact THB extra price as a decimal string, and sale status. |
| Edit for Owner | Submit the item scope, expected menu revision, an idempotency key, and explicit group/option changes. Omitted groups or options are unchanged. Validate the resulting state and return the committed projection and revision. The established setup command remains compatible and preserves choices. |
| Read for customer | Once public admission is approved, return the current revision, item and group IDs, labels, choice bounds and sellable option IDs, labels and extra prices. Exclude inactive options and Owner history. A required group without enough sellable choices makes the item unavailable; it cannot be bypassed by omitting selections. |
| Revalidate customer selections | Each cart line submits its item ID, quantity, and distinct option IDs grouped by group ID. Resolve them under the addressed restaurant and line item. Compute prices on the server. An invalid or no longer sellable selection, or a changed displayed price, requires the customer to review and confirm current choices and totals before payment. Do not substitute choices, mutate paid orders, or allocate quota during a read or cart save. |

Read and write projections must use a coherent revision: a response cannot
pair one revision with groups or prices from another. An authorized command
with a stale revision or a reused key with a changed payload conflicts without
writing. An exact replay returns its original result after current authority
and scope checks, even after later menu edits. Validate the item and scoped
references before reporting conflicts or field errors so no response reveals
another restaurant's IDs, menu revision or private configuration.

#### Shared revision cutover prerequisites

The setup-profile revision is not a menu revision. The organization setup
command increments it, but existing catalog and quality commands can change
what the organization catalog and quote return without updating that profile.
Public activation must wait until the following paths observe one menu
revision boundary for registered items and categories.

| Existing writer | What must participate in the native revision |
| --- | --- |
| `restaurant/organization_menu.go` and `restaurant/setup.go` | The organization menu command can register and update items. Retained `SaveMenu` can still update shared catalog rows. Include a retained write when it touches a row used by the native projection; retain its request shape, existing authorization and distinct replay contract. |
| `catalog/products.go`, `catalog/variants.go`, `catalog/service.go` | Product names, category assignment and status, variant name, price, unit and status, and referenced category/unit changes can alter current menu projections. Limit revision participation to changes relevant to the restaurant menu. |
| `catalog/imports.go` | `ConfirmImport` updates existing variants through `saveVariant` and can write the product directly. The committed batch must include all affected changes in the same revision and roll back that revision on failure. Preview and replay must not increment it. |
| `inventory/quality.go` | A variant-wide recall suppresses sale in both organization readers. Its publication must invalidate an earlier purchase confirmation. Keep the recall's existing authorization and immutable evidence; a menu restore must not reopen a recalled item. |

Migration 48 provides an append-only revision table. The proposed writer
reads the last committed revision after taking the existing organization row
lock and appends the next revision with before/after state and actor. The
organization row serializes allocation even when no revision exists yet.
The business writes and revision append must commit together. Identify
existing security, recall and import locks before
choosing the final order. In particular, migration 13's
`quality_recall_guard` takes `organizations ... FOR UPDATE` inside the
insert, and `ConfirmImport` locks its import job. Trace those paths together
with payment admission before assigning the lock order. The starting order
for review is existing authority proof, organization row, then import job
or menu rows. `AuthorizeMFA` already locks the organization
after session proof; retained `trackingPaymentTx` resolves the order proof
before locking the organization. Do not change either proof boundary or
acquire the revision lock inside an inner SQL helper after an affected
business lock is already held. A consistent snapshot must include revision,
item, options and eligibility; reading the
revision in one read-committed statement and the menu in another is insufficient.
Payment entry must revalidate under the write-side coordination, since a
coherent read alone cannot prevent a later change racing admission.

Acceptance: (1) race an exact native edit against a retained setup edit and
against catalog import; the observable revision and projections must agree
with the commit sequence, with no lost edit or duplicate revision on replay;
(2) change a referenced category or unit and create a variant-wide recall
between quote and payment; the outdated confirmation must not admit payment
or reserve anything; (3) fail an update after touching shared data and prove
the revision, history and effects all rolled back; (4) interleave unrelated
restaurant writes and prove their revisions, history and access remain
isolated. Keep native activation off until the writer inventory and these
checks are independently verified. Existing orders and retained APIs stay
available throughout the additive cutover.

Bind the customer's confirmation to the server quote for those exact
selections, quantities, extras and totals. A newer revision triggers a
server revalidation; if the confirmed choices, prices or availability no
longer match, the previous confirmation cannot admit payment. The customer
may request a fresh quote and confirm again. This quote does not by itself
prove quota is held or the restaurant admits a new payment attempt.

Before publishing, cover retained saves preserving choices, coherent reads
during concurrent edits, exact replay versus changed-payload conflict,
foreign and wrong-parent IDs, unavailable required groups, exact extras,
and reconfirmation after a price or choice changes. Include the case where
two lines use the same item with different valid selections; their choices
and totals must remain distinct in the order snapshot. Verify that later
edits and restores leave that snapshot unchanged. Quota allocation and hold
timing stay with B14; CSV/XLSX activation stays with B16. Route naming and
OpenAPI registration follow review of the native producer and consumers.

### B16 proposal: version 1 template and apply policy

Use one rectangular table for UTF-8 CSV (optional BOM) or a single-sheet
XLSX workbook. One table fits the existing parser and gives both formats the
same validation rules. Proposed ceiling: 5 MiB input, 2,000 data rows, and
20 MiB aggregate expanded XLSX size, matching the catalog parser. Reject
formulas rather than importing their cached results. These are proposed
restaurant limits, not an approval to change the retained catalog importer.

Use an explicit template version and row kind. The CSV header below also
defines the XLSX header row. Column names are fixed; column order may differ.
Every data row must use template version `1`. Reject unknown or duplicate
headers, mixed versions and inconsistent row widths before preview.

```csv
template_version,row_kind,ref,parent_ref,name,price,sale_status,min_choices,max_choices
1,CATEGORY,rice,,Rice bowls,,,,
1,ITEM,basil-rice,rice,Basil rice,85.00,ACTIVE,,
1,GROUP,protein,basil-rice,Protein,,,1,1
1,OPTION,chicken,protein,Chicken,0.00,ACTIVE,,
1,OPTION,beef,protein,Beef,20.00,ACTIVE,,
```

Proposed fields by row kind:

| Row kind | Stable reference | Editable fields |
| --- | --- | --- |
| `CATEGORY` | `ref` | `name` |
| `ITEM` | `ref`, `parent_ref` (category) | `name`, `price`, `sale_status` |
| `GROUP` | `ref`, `parent_ref` (item) | `name`, `min_choices`, `max_choices` |
| `OPTION` | `ref`, `parent_ref` (group) | `name`, `price` (extra charge), `sale_status` |

References address entities within the current restaurant and row kind, not
display names or database IDs from another tenant. Reject duplicate entity
references, missing parents and fields that do not apply to the row kind.
Resolve references against the proposed final menu so file order does not
matter. Validate prices as exact decimals and preserve explicit zero; a blank
optional field is not a request to clear a price. Omission does not delete an
item. Deactivation is explicit (`INACTIVE` on an item or option). The status
values in this template are proposed wire values, independent of storage
enums. For an existing entity, a blank applicable field preserves the current
value; for a new entity, require the name and all applicable parent, price,
status and choice bounds. For a group, zero minimum means optional; a
positive minimum means required. Validate the final group's bounds against
the final sellable options before applying. Quota fields wait for the T3.7
contract.

Recommend all-or-nothing apply. Preview reports add/change/unchanged/error
with line and field; it does not modify the menu. Apply rechecks the Owner
and restaurant, the exact preview contents and base menu revision. Any invalid
row or intervening edit rejects the batch and requires a fresh preview.
One successful batch records the menu revision and audit in the same
transaction; an identical retry returns the recorded result. A retry with
changed content conflicts. Price, category and sale-status bulk edits use the
same revision boundary. The transaction never rewrites a paid snapshot;
pending carts revalidate against the committed menu on their next operation.

#### Retained parser and native preview boundary

`catalog/import_parser.go` already checks UTF-8, strips a CSV BOM, enforces
rectangular CSV rows, and handles sparse XLSX cells within the header width.
It checks ZIP entry count, expanded size and worksheet coordinates, and
rejects formula cells. Reuse these format checks; apply the fixed header,
row-kind and reference validation after parsing, independently of format.
Neither format may round prices or coerce an empty value to zero. Reject
scientific notation and values that exceed the supported decimal precision
before apply, even if a workbook stores them as numeric cells.

The retained `ConfirmImport` resolves catalog rows by tenant SKU and uses
product/variant revisions. Its creator-only preview, authorization recheck,
and stored replay result are useful patterns; its mapping and UPDATE logic
cannot identify native categories, groups or options. Migration 38 keys the
native menu by restaurant/category or restaurant/variant, and migration 47
keys modifier options by their owning group. The proposed `ref` has no
durable mapping in those tables. B16 must select how repeated templates bind
an existing entity after rename, for example by a durable restaurant-scoped
reference or a tenant-scoped reference issued by an existing-menu template.
Do not infer the mapping from a display name or treat an unmatched update as
an insert. Verify that unknown or foreign references cannot update another
restaurant and that moving an existing item retains its identity and history.

Acceptance should cover format parity, Thai text and decimal fidelity,
duplicate/missing/foreign references, malformed or oversized files, stale
preview, apply/retry concurrency, audit failure rolling back the whole batch,
unchanged paid snapshots, and stale pending-cart rejection. Approval is
still needed for the template, limits and atomic apply policy. Preview
retention and the shared modifier/availability fields need their owning
contracts before implementation.

<a id="d04"></a>

## D04. Marketplace, discovery, reviews and customization

Covers: VLP-011, VLP-024, VLP-026, VLP-027, VLP-033, VLP-077.
Admin owns market/community/category registries and approves merchant requests.
Directory and discovery use text, categories, consented location, distance,
price, reviews, open/delivery state and queue context. No full map explorer is
required. Multi-community placement must retain the real restaurant location
for delivery calculations.

Storefront customization stays within shared tokens, permitted colors, banners,
gallery, featured menus and section order. Preserve SmartPOS yellow, local
Thai/Latin fonts, Lucide and the Apple-inspired adaptive UI. No arbitrary themes
or unrelated redesign. Approved storefront presentation does not authorize
additional Scope 93 asset-management behavior.

One 1-5 star/text review per genuinely Completed order, using member ownership
or secure guest proof. No review for Ready or No-Show. Review images and merchant
replies are not mandatory scope. Rule-based recommendations use favorites,
owned order history/interests and current availability/queue. Support opt-out
without losing core service; guests receive general results. Keep Organic,
Sponsored and AI-chat surfaces distinct.

<a id="d05"></a>

## D05. Identity, authority and privacy

Covers: VLP-012, VLP-031, VLP-046, VLP-067, VLP-070.
Keep optional customer accounts and Guest checkout. Member identity supports
email/password and Social Login, email verification, recovery and sessions.
On 2026-11-22 the user selected Google plus Email/Password, TOTP MFA and single-use
recovery codes. Detailed authority, reauthentication and privileged recovery
contracts remain T1.3/T6.4 work; existing Google code does not establish MFA.
The user additionally approved on 2026-11-22: sensitive actions require fresh
password or Google authentication together with TOTP within five minutes;
recovery code plus primary login permits TOTP replacement and revokes all prior
sessions. Losing both TOTP and recovery codes restricts privileged access pending
Admin verification under evidence rules still to be defined. Email password reset
cannot remove MFA. Recovery codes do not independently authorize sensitive actions.
Platform Admin authority will be provisioned by a server-side management command
using an explicitly verified user ID and an audit event, as selected by the user
on 2026-11-22. No self-service Owner elevation or actual Admin grant is authorized
by this selection. The local schema43 command now has scoped acceptance in tasks.md;
mandatory authority enforcement and manual recovery evidence remain open.

### Authority matrix for the native restaurant flow (T1.3)

These are required boundaries for native operations. Retained branch
operations continue to use their own organization, branch and permission
checks until their replacements are accepted.

| Actor | Required authority | Denial and acceptance evidence |
| --- | --- | --- |
| Public visitor | Only the approved public restaurant and menu projection. A persistent QR can identify a table but grants no private access. | Public responses contain no customer/session/order credentials, payment evidence or internal audit. |
| Guest | No account for checkout. Private order operations require server-validated proof for that exact order and restaurant; a Dine-in session has separate proof under D02. | Deny order number, contact info, QR, wrong order proof and proof from another restaurant. An order claim also requires a signed-in member and must atomically prevent a second claim. |
| Member | Active signed-in identity plus an explicit owner predicate on the requested customer record or order. Claims are per order and do not change payment, reviews or points. | Deny foreign member, guest order without valid claim and a session revoked before access. Use the same predicate for reads, mutations and timeline subscriptions. |
| Restaurant Owner | Active Owner of the addressed organization, active session and current MFA for protected operations. Only one account can hold native Owner authority per restaurant. An Owner of multiple restaurants selects one context per request. | Verify ownership under the transaction boundary. Deny missing MFA, wrong restaurant, stale or revoked session, and old Owner after transfer. Never infer which retained Owner to keep or widen a branch grant. |
| Platform Admin | Separate server-provisioned active authority, current MFA and permission for the particular approved operation and target. Owner membership cannot confer platform authority. | Verify removal and session revocation, deny Owner self-elevation, and audit attributable actions. Approval of transfer or receiving-account activation requires its own evidence workflow. |
| Elevated sensitive operation | The actor must pass the applicable Owner or Admin gate plus fresh verified primary proof and current TOTP for the same account and session within five minutes. Apply to receiving-account changes, transfer and ads credit refunds when their native writers exist. | Deny a fresh login alone, a fresh TOTP paired with absent or old primary proof, a recovery code alone, and proof expiring before the final authorization checkpoint. Denial may not mutate the target or return a previous private result. |

Scope each command replay, stream, attachment and export to the actual
resource and current authority before returning any private payload. On
account, organization or branch change, discard the old client context and
do not accept responses into the new context. Backend access checks remain
required even when the UI has already removed the old workspace. For the
transfer transaction, verify both the replacement and removal of old
authority, including continued denial from the former Owner's session.
Retention, manual recovery and merchant evidence remain under B07, B12
and B10 respectively. This matrix does not grant access or assert
implementation or exhaustive acceptance.

Internal implementation checkpoint, 2026-11-22: migration 41 adds encrypted
per-user factors, recovery verifiers and nullable session assurance. The internal
service requires a verified active account and a primary session younger than
five minutes for enrollment, then consumes the confirmation step, factor
activation, recovery verifiers, session assurance and audit in one transaction.
Challenges serialize proof consumption under user/session/factor locks. The user
lock is `FOR NO KEY UPDATE`: this serializes security-state writers and avoids a
cycle with logout's session update followed by its audit foreign-key check.
Failed proofs retain their separate attempt counters. Retained sessions receive
no inferred MFA assurance. The key and key ID are explicit server inputs; no real
key or environment secret has been created. The schema-41 internal checkpoint is
followed by additive schema 42, binding pending enrollment to its initiating
session without inferring bindings for retained factors. Unbound retained pending
factors cannot activate and may be restarted; active factors remain usable.
The current local API slice adds authenticated MFA status, enrollment,
confirmation and challenge, matching typed client/OpenAPI contracts and optional
paired server-only encryption configuration. Missing configuration returns 503;
malformed configured keys fail startup. Enrollment/confirmation require primary
login within five minutes; proof-time eligibility is checked after session/factor
locks. Confirmation returns recovery codes once after the transaction commits;
a lost successful response cannot redisclose codes, so callers must check status.
Recovery-code regeneration and key rotation remain unavailable. This API slice
does not establish mandatory Owner/Admin MFA enforcement, five-minute
sensitive-action grants, recovery-code consumption or secure recovery. Its
matching verification and independent review are tracked in tasks.md.
The local `/security` interface now exposes these accepted enrollment/challenge
contracts outside organization context, using the bilingual account shell.
Secrets remain in session-scoped component memory; confirmation and recovery-code
display guard navigation/unload. Aborted confirmation may still commit, so the
interface warns before departure and requires status rechecking after unknown
outcomes. Recovery use is explicitly unavailable. Component, intercepted-API
responsive browser and independent review evidence are recorded in tasks.md;
this interface acceptance does not close the downstream authority/recovery gates.
The accepted internal gate core now binds `Current`'s non-serialized session ID
to the transaction, locks user then session/factor before business locks, and
provides a fresh database-time recheck for account/session/factor eligibility and
proof chronology. Active factors outlive enrollment expiry. Consumers must
recheck after later waits and before protected effects/commit; the guarantee is
eligibility at the final check, not at future physical commit time. Actual
runtime-role concurrency and independent-review evidence are in tasks.md.
Both organization creation methods and Context now acquire and recheck this gate
independently while retaining current OWNER, tenant and membership checks. A
creation commit may precede a denied Context response; the setup interface keeps
the same per-user/per-tab idempotency key and payload fingerprint across unknown
outcomes and reload, then offers explicit account-security or sign-in recovery.
No raw shop fields or proofs are persisted by that recovery helper. List now
independently requires live session MFA even for empty results and rechecks after
its query before returning private records. Organization-local Update, Branches,
SaveBranch and Audit now use a typed transaction/MFA authorization handle, acquire
security locks before organization authorization, and explicitly recheck after
waits and before private return or commit. Denied writes roll back business and
audit effects; private reads return no data on failed assurance. Their isolated
HTTP, permission, tenant, expiry and review evidence is recorded in tasks.md.
Other independent raw Authorized consumers remain pending, so this bounded cutover
does not establish full Owner/Admin MFA coverage or sensitive-action authority.
The branchless setup private read now independently acquires the same typed gate,
preserves restaurant/OWNER/tenant checks and returns zero state on failed final
assurance after query waits. Setup HTTP maps assurance failures to401/403 without
data. The later branchless write/replay cutover now carries this handle through
all seven setup operations and their menu/table writers, rechecking after command
and helper waits and before protected effects, private replay or commit. Failed
assurance returns zero state and rolls back profile, menu, QR, command and audit
changes together. Completion retries retain a UUID scoped to user/organization/
branch in per-tab storage across sign-in/remount and unknown results, failing
before submission when storage cannot safely retain or read it. Only a matching
confirmed completion clears that key. Matching isolated database, HTTP, replay,
expiry, revocation, frontend/browser and independent-review evidence is recorded
in tasks.md. The retained-branch setup read, seven writes and matching replays
now independently carry the same typed MFA handle with explicit checks after
waits and before private results, later effects and commit. Actual runtime-role
expiry, tenant/permission, cancellation, commit rollback, concurrency and logout
acceptance and independent review are recorded in tasks.md. Existing branch,
command fingerprint, QR replay and completed-setup semantics are preserved.
The eight retained restaurant employee service entrypoints now independently
carry the same typed MFA handle while preserving their permissions and explicit
active branch scope. Reads and create replays check before private return; writers
check after waits, before later effects and before commit, returning zero results
on failure. Shared typed command helpers preserve immutable creation replay while
raw public and settlement helpers remain unchanged. Matching runtime-role expiry,
rollback, revision, concurrent replay and complete paid-kitchen eligibility
regressions and independent backend review are recorded in tasks.md. The six
existing HTTP operations describe401/403 without data; internal recipe/forecast
methods gain no routes and forecast remains local unavailable status. The
restaurant command hook now preserves an immutable in-memory payload/key and
sticky uncertainty until matching success, binding explicit retry to its original
user, organization, branch, path and method while permitting refreshed CSRF.
Context changes fence dispatch and private completion callbacks/results; success
invalidates the original tenant cache. Matching hook, TableForm, static and
independent-review evidence is recorded in tasks.md on 2026-11-23. Navigation,
remount and reload durability and full recovery UX remain pending; no payloads or
proofs are persisted by this hook.
Catalog taxonomy, Product/Products, barcode lookup, ImportJob and labels reads now
independently acquire typed MFA before business locks with their existing
permissions. Nested tenant predicates, creator-only imports, exact prices and
pagination remain. Usable transactions recheck before private data or domain
errors; aborted SQL failures return sanitized errors without private payload and
cannot recheck. All interrupted/helper failures discard accumulated data and page
metadata. Rows close before nested queries and final rechecks. The nine existing
GET contracts preserve no-store and map assurance failures to401/403 without data.
Matching runtime-role denial, lock/expiry/cancellation, tenant isolation,
partial-result, client and independent-review evidence is in tasks.md on
2026-11-23. All eight Catalog writers now acquire typed MFA and carry the same
authorization transaction through nested product, variant and barcode effects.
They recheck after waits, between effects and before audit/commit, returning zero
outward data on failure. Existing permission, tenant, creator, revision, exact
price and import-mode rules remain. Completed creator/job/mode replay rechecks
assurance and returns its stored result without new effects; commit uncertainty
still needs reconciliation before retry. Matching runtime-role rollback,
concurrency, HTTP/client, contract and independent-review evidence is in tasks.md
on 2026-11-23. Other retained consumers, five-minute sensitive authority, recovery
and full T1.3 remain pending; these slices add no schema, printing or provider
effects.
Customer Get, List, Groups, History and Audit now independently acquire typed
MFA for their five service entrypoints and six HTTP routes, including body-only
POST search. Existing permissions, tenant/branch predicates, group counts,
masking and exact historical values remain. Reads close rows before rechecks;
all failures discard private data and pagination/summary metadata. Usable
transactions recheck domain errors; aborted SQL keeps sanitized classification
without returning data. Audit retains its existing customer-object/event-prefix
scope and does not apply branch/date filters. Matching runtime-role lock,
expiry/cancellation, revoked-session, SQL-fault, history and client evidence plus
independent review is recorded in tasks.md on2026-11-23. This read slice changes
no schema or isolation level. Customer Save, SaveGroup, Archive and Membership
now also independently acquire typed live MFA for all seven write routes. They
retain normalized creator-bound creation keys, current-resource replay, optimistic
revisions, tenant/permission checks, contact masking and archived-group removal.
The same transaction rechecks after waits, between membership effects and before
audit/commit or private replay/no-op results. Failed operations return zero data;
controlled precommit denial rolls back business/audit together. An uncertain
commit error does not prove rollback. Matching runtime-role rollback, SQL-fault,
concurrency, cookie/client/contract and independent-review evidence is recorded
in tasks.md on2026-11-23. POS selection, five-minute sensitive authority, recovery
and full T1.3 acceptance remain pending. No schema or provider change is included.
Storefront private Settings, Order and Orders now independently acquire the typed
MFA gate and recheck before populated, null or empty results. Interrupted private
reads discard accumulated data; existing tenant/branch scope, inactive history,
pagination and public token-based redaction remain unchanged. Matching isolated
database, middleware, static and independent-review evidence is in tasks.md.
The private Products entrypoint now enforces the same gate for retained-branch
and organization-native menus, rechecking after settings/source waits and before
returning populated or empty results. Helper failures discard the entire private
page. Anonymous public selection and read-only helpers retain their behavior.
Matching runtime-role, contract and independent-review evidence is in tasks.md.
SaveSettings and Publish now carry the same typed MFA authorization transaction,
recheck after business waits, between effects and before commit, and return zero
results on failure. The branchless settings helper leaves commit ownership with
SaveSettings. Existing scope, source, slug, live-order, saleability and revision
guards remain. Runtime-role rollback, concurrency, exact-value, middleware and
independent-review evidence is recorded in tasks.md. Controlled precommit denial
rolls back all business/audit effects; a connection-loss Commit error can require
state reconciliation. Financial mutations remain outside these accepted slices.
QuoteOrganization now independently acquires the typed MFA transaction, checks
after settings/helper waits before returning either results or domain errors,
and discards partial quotes on every failure. Cancellation retains its context
error. Shared calculation and public quote helpers remain unchanged; no HTTP
route is added. Matching runtime-role, exact-value, no-effect and independent
review evidence is in tasks.md.
Transition now carries the typed MFA authorization through the existing order,
event and audit transaction, rechecks after waits and between effects, and
returns zero Order on every failure. Existing transition/revision/source guards
and paid/unreleased-hold/refund/review kitchen predicates remain. Cooperating
payment/refund writers retain organization-lock serialization. Matching runtime
rollback, concurrency, middleware and independent-review evidence is in tasks.md;
commit-error uncertainty still requires reconciliation rather than blind replay.
CustomerPaymentReview now uses a typed staff-payment authorization helper,
retaining both permissions and scoped organization/order/payment locks. It checks
after waits and before returning private projections or errors, discarding partial
results on failure. Matching runtime-role denial/interruption/no-effect and actual
flag/refund serialization tests plus independent review are recorded in tasks.md.
No public route is introduced; retained financial writers keep their existing
helper pending a separate cutover.
FlagCustomerPaymentFulfillment now carries the same typed authorization through
replay, reconciliation insertion, audit and final projection, checking between
effects and before commit. Failures return zero PaymentReview. Authorized replay
retains its immutable reconciliation ID and returns the current payment/refund
projection before fresh-state eligibility checks. Runtime-role interruption,
same-key concurrency, refund replay and settled-order rejection evidence plus
independent review are recorded in tasks.md. Reconciliation and audit remain
atomic; uncertain commit outcomes require state reconciliation.
prepareStaffVerification now independently acquires typed MFA authorization,
checks after replay/dispatch lookups and discards partial results on failures.
Its transaction rolls back before the bounded provider retrieval. The caller
checks cancellation before dispatch. This proves authorization at preflight time;
post-provider financial authority is reacquired separately. Existing
session binding, configured provider fingerprint and absent-dispatch recovery
remain intact. Matching runtime-role, real-session, lock-release and independent
review evidence is recorded in tasks.md.
ReconcileCustomerPayment now reacquires typed MFA after provider retrieval and
uses the current locked attempt. Checked observation insertion, deduplication
lookup and payment update share its transaction with reconciliation and audit.
Checks between stages and before private replay/commit discard partial results;
Commit errors also return zero without claiming a known rollback. The shared
public checkout wrapper preserves its original SQL ordering and state rules.
Matching runtime-role interruption,26-table rollback, concurrent idempotency,
deduplication, stale-evidence and independent-review evidence is in tasks.md.
prepareCustomerCancellation now independently acquires typed MFA authorization,
checks after the locked intent/status reads and between intent/audit effects,
and checks after the final intent read before commit or private replay. Controlled
failures return zero intent and roll back uncommitted preparation effects. The
committed immutable charge and request
audit precede bounded provider dispatch, with a caller-cancellation check after
local fingerprinting. Matching runtime-role denial/rollback/idempotency and
independent review evidence is in tasks.md. Commit errors remain potentially
uncertain; recovery retains the original operation identity. Discovered-refund
preflight now obtains typed staff-payment authorization before the locked intent
read and rechecks afterward before releasing locks. Changed key/known provider-ID
conflicts and terminal replay remain bound to the original intent; denied reads
return zero and cannot dispatch. Runtime-role interruption, exact unlocked
retrieval and independent review evidence is in tasks.md. Result finalization now
reacquires typed MFA after the provider response and validates against the
current locked intent. Checks between observation, intent, payment/hold, order,
event and audit effects and before commit discard partial results on failure.
Identical successes converge; stale pending preserves the terminal result and
contradictory terminal evidence rolls back. The release guard preserves one
payment-attempt revision increase. Matching runtime-role rollback, provider-time
authority, concurrency and independent-review evidence is in tasks.md. Commit
errors retain outcome uncertainty and the original recovery identity.
The four retained Stripe sandbox actions now use short typed MFA transactions
before local work, again before dispatch or local configuration return, and after
provider success/error. No authorization locks span body/configuration/provider
work. Postflight denial returns no private result and takes precedence over
gateway errors; an external test effect may already exist, so recovery retains
the same key/Checkout/refund identity. OpenAPI, HTTP checks on the runtime role,
unchanged local-data checks, client error/key regression and independent-review evidence
are recorded in tasks.md. This does not authorize live provider calls or assert
that denied external effects roll back.
Other raw Authorized consumers remain pending; these bounded results do
not establish full Owner/Admin MFA coverage or five-minute sensitive authority.
Owner/Admin require MFA and fresh authentication
for receiving-account changes, transfer and advertising-credit refunds.
Password reset must not bypass MFA or privileged recovery checks.

Go enforces role, customer/guest proof and restaurant scope on every command,
query, stream, export and attachment. Frontend visibility is not authorization.
Keep RLS defense in depth and transaction context; invalidate/cancel caches and
requests when account or restaurant context changes. Preserve legacy branch
isolation. Public storefront content, private order tokens and employee records
are separate projections.

Admin verifies ownership transfer and the new receiving account before atomic
single-owner replacement. Revoke old authority/sessions and audit the change.
Do not transfer bank balances or historical liabilities automatically.
Data access/correction/deletion requests follow a classified retention schedule;
required payment/transaction/dispute evidence survives where policy requires.
Retention periods and acceptable recovery evidence remain unresolved, not guessed.

<a id="d06"></a>

## D06. Cart, checkout, discounts and quota reservations

Covers: VLP-001, VLP-029, VLP-057, VLP-059, VLP-078, VLP-079, VLP-080, VLP-081.
One checkout has one restaurant. Guest carts persist per restaurant on the same
device; member carts sync per restaurant across devices. Define expiration and
version/conflict rules before implementation. Cart save/recovery does not reserve
quota, transfer dine-in sessions, place an order or initiate payment. ASAP
ordering is approved; scheduled future pickup slots are excluded.

Go revalidates menu/options, required choices, prices, delivery eligibility,
restaurant/mode readiness and benefits before payment. Customers confirm changed
or sold-out choices; never silently substitute an option. At payment entry,
reserve menu and modifier quotas, coupon use and redeemed points atomically.
Optional quotas are not ingredient inventory. Concurrent requests cannot oversell.

A discounted promotion price may combine with exactly one coupon OR points, not
both and not multiple coupons. Validate dates, menu/minimum/per-person conditions
server-side. Earn eligibility uses net eligible food, excluding delivery.
Release reservations only after authoritative confirmed unpaid; retain them for
unknown outcomes until reconciliation. Hold timing/allocation remains TBD.

Persist checkout intent, idempotency key, normalized fingerprint and principal
or guest-session scope. Identical retry returns the same order/attempt; changed
payload under the same key fails. Transactions and unique constraints prevent
duplicate orders, payments, queue entries, quotas, coupons and points. A safe new
payment attempt belongs to the same order and revalidates applicable inputs.

### Saved-cart versioning and expiry (B14 proposal)

The retained `shop-cart.ts` stores line arrays in browser storage under a
storefront slug, with an in-memory fallback. It observes cross-tab changes
but has no persisted revision or expiry; it is not a member-sync source.
Keep retained carts readable until their replacement is accepted. Never
infer member ownership from a legacy browser cart or import one on sign-in.

Proposed native behavior:

- Scope the guest draft to the device's browser storage and a stable restaurant
  identity. Scope the member draft to the authenticated member and stable
  restaurant identity; resolve both server-side for reads and writes. Keep
  guest and member drafts separate when an account changes. Neither draft
  stores private table/session proof, order proof or payment credentials.
- Use compare-and-update against the revision the editor read. Creation
  expects no current draft; two concurrent creates cannot overwrite each
  other. A stale edit does not overwrite or silently merge the current draft.
  Show the current authorized draft and keep the rejected edits available for
  explicit review. Refreshes, conflicts and replays are not edits and do not
  extend expiry. Do not claim local cross-tab safety from storage notifications
  alone; the compare and write must be serialized or the write fails safely.
- Treat an expired draft as unavailable and require explicit creation of a
  new draft. An edit from before expiry cannot resurrect it or overwrite a
  replacement draft; compare the draft identity as well as the revision.
  Expiry and conflict resolution must not reserve quota, create an order,
  start payment, or unwind any existing payment or quota hold.
- Store selections and quantities as draft inputs. Checkout must validate the
  current restaurant, menu, modifier choices and prices before the customer
  confirms. Do not apply a stored price or replace a sold-out choice silently.

Acceptance: two clients edit the same revision and only one write succeeds;
a stale client cannot overwrite a recreated draft; reading does not extend
expiry; a second guest device or foreign member cannot see the draft; changing
accounts does not import the prior draft; restoring the draft creates no hold,
order or payment. Verify guest same-browser concurrency separately from
member cross-device concurrency. Guest and member inactivity durations await
the product decision. Payment hold duration and quota allocation remain
separate B14 decisions; unknown payment continues to retain the hold.

<a id="d07"></a>

## D07. Food payment, reconciliation and degraded mode

### B02 public-document shortlist - 2026-11-22

Research only: no merchant data, application, account creation or payment API
request was sent. Provider selection, production eligibility and commercial
terms remain unresolved. The following are candidates, not accepted adapters.

| Candidate           | Public evidence                                                                                                                                                                                                    | Decision limits                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCB Thai QR Tag 30  | Official confirmation and inquiry documentation describes successful-payment callbacks, fallback inquiry and transaction identity/amount/payee fields. Inquiry returns `transactionDateandTime`.                   | Confirm restaurant-owned receiving-account onboarding, callback authentication, timestamp meaning/precision, settlement destination and terms. A public spec is not proof of production entitlement.                                                                             |
| KBank QR API        | Official product page lists dynamic Thai QR, payment callback, inquiry and settlement, with direct and POS Partner routes.                                                                                         | Direct API is stated to be for legal entities. Published eligibility and connection fees require checking the correct route; existing participating POS access does not prove this project qualifies. Detailed authenticated evidence and paid-time fields are not yet verified. |
| Omise/Opn PromptPay | Official guide documents `charge.complete`, retrieving the charge to confirm status, and a Charge `paid_at` field. Transfers documentation describes payout from the merchant account balance to a bank recipient. | Restaurant-owned account and payout arrangement must satisfy merchant-direct settlement. Do not route food funds through a platform account or confuse a transfer's `paid_at` with the customer's charge time. Eligibility, fees and multi-merchant access remain unverified.    |

Proposed next investigation: SCB merchant-owned Tag 30 first, with KBank's
appropriate partner route as an alternative. Omise is conditional on an accepted
restaurant-owned account/payout arrangement. This is an engineering proposal,
not a selected provider or permission to contact sales, register or spend.
Food payments and platform subscription/advertising billing remain separate;
the public APIs above do not settle the platform billing fallback decision.

Primary sources read on 2026-11-22:

- [SCB payment confirmation](https://developer.scb/assets/documents/documentation/qr-payment/payment-confirmation.html)
- [SCB Tag 30 inquiry](https://developer.scb/assets/documents/api-reference-index/qr-payments/get-billpayment-inquiry.html)
- [KBank QR API product and eligibility](https://www.kasikornbank.com/th/business/sme/financial-services/pages/qr-api.aspx)
- [Omise PromptPay guide](https://docs.omise.co/promptpay)
- [Omise Charge API](https://docs.omise.co/charges-api)
- [Omise transfers](https://docs.omise.co/transferring-funds)

Covers: VLP-004, VLP-062, VLP-063, VLP-082, VLP-083.
A capable provider creates PromptPay QR and authoritatively confirms payment.
Food settles directly to the verified restaurant; VELOPOS does not custody food
revenue. Existing customer Stripe test-card checkout and connection-test
PromptPay support do not prove this production settlement model. Provider
capability, merchant-account fit and evidence contracts remain blockers.

Do not introduce cash, operator-paid buttons or slip-confirmed food payment as
approved alternatives. Admin manual fallback applies only to platform Pro/ads
billing. Customer redirects and slips never establish food Paid.

Persist attempt identity, amount/currency, provider identity/event evidence,
verified successful payment time and local observation time separately. Verify
callback authenticity and query results. Apply local payment/eligible queue
and reservation effects atomically where coupled, with durable recovery when
provider outcomes are external. Deduplicate callbacks and periodic queries.

One platform-wide timeout is required; no numeric duration is approved. Fifteen
minutes is only an example, and legacy 31-minute/hour windows are not approval.
Before expiry/unlock, query the provider. Unknown means checking/reconciliation,
not unpaid. A missing callback for payment within the allowed window recovers
the same order without duplicate effects. Late-paid/contradictory outcomes need
merchant/Admin investigation and the separate refund workflow as applicable.
Reconciliation cadence, late cutoff and recovery/hold SLAs remain TBD.

Customer UI shows live state, countdown/checking and a money-debited support
path. Block new QR/attempts until safely confirmed unpaid. Provider outage blocks
new payment/checkouts, retains carts and unknown reservations, and preserves
already verified paid work. Reopen only after health checks and revalidation;
mandatory multi-provider failover is not approved.

<a id="d08"></a>

## D08. Strict FIFO and kitchen lifecycle

Covers: VLP-003, VLP-005, VLP-006, VLP-028, VLP-084, VLP-086, VLP-087.
Use one restaurant-wide queue across all four modes, ordered by verified
successful payment time, not callback arrival, order creation or queue-ticket
issuance. Persist authoritative paid time plus a deterministic tie-break identity;
its exact equal-time rule must be documented before implementation. A display
number or day rollover must not split or reorder the restaurant queue.

Current queue/transition predicates require PAID, an unreleased stock hold, no
REQUESTED/PENDING/REQUIRES_ACTION/SUCCEEDED refund intent, and no
FULFILLMENT_REVIEW reconciliation. Preserve these legacy safety checks until an
approved, tested restaurant quota/exception replacement is accepted. Do not
remove payment safeguards merely because ingredient stock is out of new scope.

Allocate exactly one durable queue identity per eligible order. Serialize coupled
allocation/state changes and enforce uniqueness/revision rules. Delayed callback
recovery retains true successful payment time. The ordering/dispatch protocol
for an earlier paid event discovered after later work has started needs explicit
resolution in T1.1/T3.4; neither rewriting started work nor knowingly assigning
callback-time FIFO is an approved answer. No FIFO acceptance before this case,
equal-time payments and cross-period recovery are tested.

Kitchen is whole-order Queued -> Preparing -> Ready. Keep payment and fulfillment
separate. Dynamic ETA uses FIFO, work and history, before and after ordering;
methodology remains TBD. No threshold overload alerts or queue/ETA auto-pause.
Owner manual pause remains global/per mode and paid work continues.

Owner reports delay reason/estimate and appends history/notifications without
reordering or auto-refund. Permitted pre-handover corrections, including
Ready -> Preparing, append actor/time/reason/Before/After and notify a customer
who saw the incorrect state. After verified handover use Admin review. Never
rewrite paid/FIFO times, purchase snapshots, prior events or amendment/refund rules.

<a id="d09"></a>

## D09. Fulfillment, cancellation, refunds and receipts

Covers: VLP-002, VLP-013, VLP-014, VLP-015, VLP-016, VLP-030, VLP-055, VLP-056,
VLP-061, VLP-064, VLP-085, VLP-088.
Separate payment, kitchen and fulfillment records. Verified Completed requires
actual handover: served-to-table confirmation for dine-in, order QR/code for
Takeaway/Pickup, and customer code for self-Delivery. Record channel evidence,
actor/time and replay-safe verification. Ready and No-Show are not Completed.
Do not infer payment evidence from completion or receipt presentation.

Self-Delivery uses the real restaurant location, configured radius and flat fee,
checked before payment. Owner updates delivery status/ETA; no platform riders or
live rider GPS. Pickup/Takeaway ready/reminder timing and No-Show evidence remain
TBD. No-Show appends reason/time/audit, allows support/dispute, and grants no
automatic refund, completion, points or review.

Customer cancellation is a request before Preparing requiring merchant approval;
no routine customer cancellation afterward. Merchant service-failure exceptions
remain possible. Amendments before Preparing require customer approval for
substitution/removal and cannot increase total. Difference refunds are merchant
manual transfers with correct coupon/points adjustment and original FIFO time.
No routine post-Preparing amendment.

Food refund records support full/partial references, deadline/reminders/overdue
alerts and Admin escalation. Merchant transfers directly and records evidence;
merchant-reported transfer is not proof of receipt by the customer. Support may
remain open. VELOPOS does not pay from platform funds or debit merchant food
revenue. Refunds append linked records without erasing original payment/receipt.
Deadline, dispute resolution and allocation details remain TBD.

Standard numbered receipts link verified paid transactions, items, discounts,
delivery and cancellation/refund references. Browser/PDF print for receipt and
kitchen ticket is read-only. No mandatory direct thermal/auto-print or full tax
invoice/e-Tax. Preserve old POS receipts, but do not require retail terminal,
shift or ingredient stock for the new approved restaurant path.

<a id="d10"></a>

## D10. Customer history, claims and loyalty

Covers: VLP-025, VLP-058, VLP-071, VLP-072, VLP-073, VLP-074, VLP-075, VLP-090.
Member profiles, addresses, favorite restaurants/menus and owned order history
support restaurant/menu/order/date/channel/status filters. Reorder creates a
new cart with current server prices/options/availability/quotas and explicit
customer confirmation. Do not copy coupons, redeemed points or table sessions,
and never auto-start payment. Guests retain secure token/claim access.

Claim one guest order with secure possession proof, not matching order number,
email or phone alone. Atomic ownership/link checks prevent duplicate claim.
Claim changes no payment state and grants no automatic review or points. A
separate retroactive points request checks the TBD time window, ownership, Paid,
verified Completed, net refund-adjusted eligibility and previous grants.

Restaurant-local points batches have expiry and FEFO redemption. Append
Earn/Redeem/Expire/Reverse/Restore events; earn only on Paid AND verified
Completed eligible net food, excluding delivery. Full/partial refunds reverse
safely, including spent-earns debt/compensation; restoration preserves expiry
rules. Values, rounding/allocation edge cases and expiry policies remain TBD.

Program closure needs advance notice, an earn stop and redemption grace period.
Suspension freezes earn/redeem without erasing points. Archival reviews balances
and customer notices. No automatic cash conversion, cross-restaurant transfer or
referral codes/rewards/analytics.

<a id="d11"></a>

## D11. Notifications, chat and customer event projection

Covers: VLP-017, VLP-023, VLP-060, VLP-076, VLP-089.
Deliver real-time authorized website updates independently of browser push.
Push needs browser permission; dashboard sound/notifications support restaurant
operations. Separate service events from granular promotional/coupon/recommended-
restaurant opt-ins and append consent/withdrawal history. No LINE/LIFF dependency.
Transport choice and notification timing need design/policy resolution; existing
15-second polling is evidence of a slice, not final latency acceptance.

Customer-restaurant chat supports pre/post-order text and image/file attachments,
history, reports and Admin moderation, with participant/guest scoping. This is
separate from AI chat and support disputes. Apply protected attachment access,
retention and validation through established security conventions; do not invent
file-size/retention policy values.

Project a chronological customer timeline from immutable backend events for
payment, queue, preparation, delays/ETA, corrections, ready, handover and refunds.
Member ownership or secure guest token is required. Explicitly allowlist visible
fields; never expose internal audit, fraud cases, secrets or other customer PII.
Timeline rendering cannot mutate business state.

<a id="d12"></a>

## D12. Admin, support, fraud and restaurant lifecycle

Covers: VLP-020, VLP-044, VLP-045, VLP-066, VLP-068.
Platform Admin operates user/restaurant approvals, registries, disputes, fraud,
audit and ads review through scoped privileged actions. Support tickets carry
order/restaurant/category, evidence, replies and status for authorized customers,
guests and restaurants. Admin reviews cases but cannot custody/debit food funds.

Rule-based anomalies cover payment, order, ads, wallet and access with Admin
alerts. Preserve authentication/RBAC/tenant scope, rate limits, verified
callbacks, atomic ledgers and audit. No ML fraud engine is required.

Warnings, temporary suspension, revocation, appeals and reapproval retain
reason/evidence/audit. Stop new ordering/payment and inappropriate ad spend;
preserve paid work, refunds, support, wallet and protected points. Closure is
owner-requested, then obligation review and Admin archival, not deletion or
liability release. Reopening needs reapproval. Detailed policies remain TBD.

<a id="d13"></a>

## D13. Platform billing, advertising and wallet

Covers: VLP-021, VLP-035, VLP-036, VLP-037, VLP-038, VLP-039, VLP-040, VLP-041,
VLP-042, VLP-043.
Separate platform Pro/ads money, credentials/evidence, ledgers and refunds from
food funds. No platform food-order commission. Free retains core selling/menu,
table QR, orders/FIFO/kitchen, payment, Pickup/Delivery and basic dashboard.
Pro adds advanced reports/storefront. Both can buy ads. Exact benefits/prices
are TBD. Monthly/yearly renewal is manual, with expiry notice and data-preserving
Free downgrade, never automatic charging.

Platform PromptPay confirmation is primary; exceptional Admin manual billing
review is audited. Paid campaigns also require Admin approval. Support fixed,
CPC and CPM models, budgets, durations, targeting and relevant placements on
home/community/search surfaces. Always label Sponsored; never sell hidden
Organic ranking or hide paid placement in AI recommendations.

Prepaid ad wallet separates available, campaign-reserved, spent and refund-locked
amounts. Atomic append-only ledger operations prevent overspend/double spend;
release unused reservations. Credit refunds lock funds during Admin review and
manual transfer with evidence/audit. No food funds or points in this wallet.
Report impressions/clicks/CTR, attributed Paid orders/revenue, conversions and
ROAS; deduplicate events, respect privacy and adjust attribution for refunds.
Tariffs, attribution windows, fraud thresholds and refund procedures remain TBD.
No advanced cross-device attribution is required.

<a id="d14"></a>

## D14. Analytics, export and partner access

Covers: VLP-019, VLP-051, VLP-069.
Scoped advanced analytics include time filters, sales, best sellers, cancellation,
refund, busy periods, identifiable repeat customers, queue performance and
trends, with CSV/Excel. Do not invent net profit without cost data.

Owner batch exports cover menus/categories/prices, orders/reports, promotions,
reviews and business profiles in CSV/Excel/JSON as appropriate. Audit request
history, redact unauthorized PII and expire download links. Format-to-data mapping,
permitted customer fields, job/link limits remain TBD.

Approved partner credentials have explicit read scopes/rate limits/audit for
restaurant/menu/order-status API and webhook delivery. Do not reuse public guest
order authority or allow partner order creation. Credential/guest/tenant negative
tests and webhook replay/failure tests are required before acceptance.

<a id="d15"></a>

## D15. Internal customer shopping assistant

Covers: VLP-022.
Go supplies authorized current restaurant/menu/price/queue/availability context
to the internal AI service through a typed contract. Return grounded comparison,
recommendation and modifier/cart assistance for one restaurant. Customers must
expressly confirm order and payment. Identify Sponsored content transparently.
The assistant cannot authorize payment, mutate stock or autonomously order.

Replace seeded/fallback restaurant claims rather than treating the current
keyword UI as a production AI integration. Insufficient data, unknown menu,
provider outage and AI timeout have explicit safe responses. AI failure must not
block normal ordering. A future billable model/provider or project-data
transmission needs separate exact authorization; no provider was selected here.

<a id="d16"></a>

## D16. Quality, operations and release gates

Covers: VLP-047, VLP-048, VLP-049, VLP-050, VLP-052, VLP-053, VLP-054.
Thai/English applies across customer, restaurant and Admin journeys, with merchant
menu text in both languages, Thai fallback and THB only. No mandatory AI
translation. PWA permits install and limited cached public offline reads only;
ordering/payment/queue changes require online server revalidation. Clear private
caches on logout/context changes. No offline payment queue.

Target WCAG 2.2 AA, with keyboard, screen-reader, focus, contrast and validation
checks. Preserve loading/empty/error/recovery states. Browser acceptance covers
360px, 390px, 1280px plus a representative tablet, zoom, long Thai/English text,
touch targets and overflow. Distinguish emulation from real-device evidence;
no visual/mobile/conformance claim from documentation or builds alone.

Plan encrypted separate-store PITR, restore drills and post-restore order/payment/
FIFO/wallet reconciliation. RPO/RTO, backup and drill cadence remain TBD.
Centralize redacted logs, metrics, traces, dashboards and alerts for API/payment/
orders/queue/wallet/backup. Current logging alone is not full observability.

CI/CD requires automated tests/security checks, staging validation, manual
production approval, rolling release, health checks, application rollback and
backward-compatible migrations with idempotency/reconciliation. No automatic
HA failover is required. Initial design targets of about 1,000 restaurants,
5,000 concurrent users and 10,000 orders/day require measured load/stress tests;
they are neither proven capacity nor guaranteed SLOs.

Future acceptance layers: focused domain tests, API/contracts, isolated database
migration/transaction/concurrency/isolation tests, React interaction tests,
Playwright primary/negative/recovery flows and the applicable operational drills.
Required independent security/correctness review remains mandatory for actual
high-risk changes. Its dispatch requires explicit scoped authorization. This
specification neither dispatches reviewers nor removes the review gate.
Push, deployment, external services, production data and persistent monitoring
require their own authorization. Release names target/version/impact/rollback.

## Reconciliation outcome and unresolved choices

The missing-source blocker is resolved. All 92 exact decisions map through
requirements.md to D01-D16 and tasks.md. No priorities or reduced MVP were
inferred. No application code, contracts, migrations, data or live controls were
changed during reconciliation.

Remaining decisions are B02-B16 in requirements.md; B01 Option A is approved.
Its retained-data and compatibility proof remains pending. Resolve only those needed by
a selected task, record authority/evidence and keep dependent work blocked.
In particular, provider/direct settlement, restaurant compatibility evidence, paid-time
FIFO recovery, payment/hold policies, privileged identity recovery, ledger/refund
policies and import semantics are not ready for implementation acceptance.
