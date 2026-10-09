# Phase 1B organization, branches and authorization

Local implementation gate: **COMPLETED (2026-10-09)**. Phase 1C is **NOT STARTED**. This document describes implemented boundaries, not production certification or sales/catalog features. Evidence is in [verification](../development/verification.md).

## Repository and domain decisions

- Retain React/TypeScript/Vite/TanStack Query, Golden Amber tokens/local fonts, the Go modular monolith, PostgreSQL, internal FastAPI and Caddy. No new dependencies or placeholder domains were introduced.
- Organization is the single tenant abstraction; do not create a parallel Store tenant. A global user may have one unique membership per organization with different role/status/branch assignments. Removing a membership does not delete the user's account or memberships elsewhere.
- Existing organization/branch tables from migration 1 are extended, not recreated. A branch belongs to exactly one organization. Codes are normalized to uppercase by API validation; organization code is globally unique, branch code is unique within its organization.
- Fixed roles belong to the organization membership, not global identity. No custom role editor or browser-trusted role/organization header exists. Branch membership FKs include organization ID; assigned non-Owner branches must be active and same-tenant.
- Go's organization module owns policy, validation, transactions, persistence and transport in a small set of real-use-case files. Branches/employees are not empty independently scaffolded modules. Identity still owns sessions/Origin/CSRF; transport composes both modules.

## Onboarding and database changes

`000003_organization.up.sql` is additive/forward-only. It extends organization details/defaults and branch contacts/main-branch flag; adds organization_memberships, branch_memberships, organization_invitations, organization_audit_events and organization_creation_requests; adds composite FKs/indexes/owner constraints and the runtime role. Readiness requires a clean migration version 3.

Organization creation uses one transaction for organization + active Owner + active main branch + THB/default Asia/Bangkok/th-TH configuration + audit + idempotency record. Per-user UUID `Idempotency-Key`, a normalized payload SHA-256 fingerprint and transaction advisory lock prevent duplicate retry creation; reusing the key with different content returns 409. Creation failure leaves no partial organization. Main branches are unique per organization; no branch is hard-deleted, and the final active branch cannot be deactivated.

Migration does not guess ownership of legacy bootstrap organizations. They remain inaccessible through membership-based APIs until ownership is explicitly reconciled. New organization/member writes enforce at least one active Owner through deferred triggers; API changes lock the organization row before checking/changing roles or status. Runtime has no membership hard-delete privilege. Local verification upgraded only the isolated test volume; original development/production data was not migrated or deleted.

## Role and branch policy

| Actor                                        | Implemented scope                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER                                        | Organization settings, all branches, members/invitations/roles/audit; can promote an existing member to Owner; must retain an active Owner. Owner branch_ids is empty because authority spans all tenant branches.                                                                 |
| MANAGER                                      | Assigned active branches, branch detail updates (not creation/deactivation), employee/invitation/audit management only for operational staff whose entire old/new branch sets are within assigned active branches. Cannot edit self, OWNER or MANAGER; cannot grant OWNER/MANAGER. |
| CASHIER / INVENTORY_STAFF / PURCHASING_STAFF | Organization context and assigned active branches; organization contact fields redacted; no employee/role/audit/settings writes. These role names do not imply unimplemented operational permissions.                                                                              |

Inactive branch grants are filtered from actor context. A Manager with no active branches has only organization.read/branch.read; employee/role/audit management denies. All reads/writes recheck active organization membership; removed/suspended membership loses tenant access without global logout. Members with other tenant memberships retain access to those unrelated tenants. Permission matrix is fixed server data, not an editor.

## API contract and frontend map

All paths below are under `/api/v1`; exact request/response schemas are in OpenAPI. JSON bodies reject unknown fields and are bounded. Authenticated writes require allowed Origin and `X-CSRF-Token`. PATCH inputs are complete editable DTOs, not sparse patches. Errors use existing envelopes: invalid input 400, insufficient permission 403, unavailable/out-of-scope resource 404, uniqueness/ownership/state conflicts 409, dependency failure 503.

| API                                                                              | UI/use case                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST `/organizations`                                                        | `/setup`: organization list/three-step onboarding/review; creation requires Idempotency-Key.                                                                                  |
| GET/PATCH `/organizations/{id}`; GET `/context`, `/permissions`                  | `/settings/store`, organization/branch switchers and context permission gates.                                                                                                |
| GET/POST `/organizations/{id}/branches`; GET/PATCH `/branches/{branchId}`        | `/settings/branches`: scoped searchable list/create/edit/status.                                                                                                              |
| GET `/organizations/{id}/members`; GET/PATCH/DELETE `/members/{memberId}`        | `/employees` and `/employees/:id`: details, role/status/branch assignments and confirmed membership removal. Role changes share the member PATCH; no redundant role endpoint. |
| GET/POST `/organizations/{id}/invitations`; DELETE `/invitations/{invitationId}` | Staff invitation/pending status/revocation.                                                                                                                                   |
| POST `/invitations/accept`                                                       | `/setup`: authenticated invited account accepts its email-bound token.                                                                                                        |
| GET `/organizations/{id}/roles`, `/audit?member_id=...`                          | `/roles`: fixed matrix; membership detail change history. Audit limited to latest 100 matching scoped events; invitation list latest 200.                                     |

Six Phase 1B pages are implemented without expanding the planned 16-module/106-route inventory. `/approvals`, `/audit-logs`, generic settings landing and unrelated business pages remain unregistered/planned. Loading/error/empty/permission-denied states are explicit; actions require backend approval.

## Invitation lifecycle

An authorized Owner/Manager chooses normalized email, allowed role and active same-tenant branches. A cryptographically random token is stored only as a 32-byte SHA-256 hash with 48-hour expiry. No raw token is returned by the API. Duplicate pending invitations conflict; expired pending invitations are revoked before replacement. Removed members may rejoin through a fresh invite; active/suspended memberships cannot bypass administrative state via an invite.

Acceptance requires the authenticated recipient's email, rechecks token expiry/revocation/replay and inviter's current active authority/branch assignments under the organization/invitation lock, then atomically creates/reactivates membership, replaces branch assignments, consumes token and audits. Concurrent accepts produce one success. Invitations cannot grant OWNER directly; only a currently authorized Owner may promote an existing membership.

SMTP delivery has a bounded deadline inside the transaction. SMTP outage rolls back and returns 503; no phantom pending invitation is committed. Delivery is not a durable outbox, so SMTP acceptance followed by database commit failure may deliver an unusable link. The email points to `/setup` with a fragment token; provider strips it on mount and retains memory through SPA sign-in/register. Reload before accepting requires reopening the original emailed link. Browser storage holds no token.

## Tenant isolation and caching

- API validates actual global session, membership, fixed permission and branch scope; IDs in URL/body are untrusted and always checked against organization.
- Each tenant transaction sets local organization/user context and explicitly filters tenant tables. Organization/branch forced RLS provides defense in depth; membership/invitation/audit/creation tables are not fully RLS-protected. HTTP tests prove implemented tenant denial, not isolation from arbitrary SQL or compromised bootstrap credentials.
- `smartpos_runtime` is NOLOGIN/NOSUPERUSER/NOBYPASSRLS with scoped operation grants; API selects it after each pool connection. Existing local bootstrap credentials are still privileged and production must use a least-privileged LOGIN role authorized only for this runtime role, separate from migration credentials. No production role was provisioned.
- Organization row locks serialize tenant operations, simplifying owner/revocation consistency but limiting per-tenant concurrency; SMTP extends the hold. Revisit measured contention and durable delivery in later operational gates rather than weakening checks.
- Query keys include user/organization/branch/resource; switch/logout cancels/removes prior caches and does not reuse cross-tenant placeholder data. Only user-scoped org/branch preference IDs enter sessionStorage. Preferences never authorize access.
- Context revalidates on focus/every 30 seconds; stale screens can remain briefly, but every API write independently rechecks. Removed membership/context query failure closes the frontend gate.
- Successful changes audit actor/action/object/branch scope/request ID in the same transaction with runtime SELECT/INSERT-only audit grants. No plaintext secret/token payload is audited. Failed/denied requests are not all persisted to this audit table.

## Verification and remaining gates

Go policy/validation tests, rollback-only SQL, real Caddy/PostgreSQL/Mailpit integration, frontend cache/onboarding tests and integrated browser scenarios cover onboarding/idempotency, tenant/branch denial, Manager escalation denial, suspension/removal, invitation expiry/replay/email binding/revocation/concurrency, last-owner concurrency, Origin/CSRF and sanitized logs. Browser suite checks all six pages at 320/375/640/768/1024/1440/1920px and meaningful mobile/desktop screenshots.

Production TLS/SMTP/deployed IPv6, least-privilege LOGIN credentials, durable queues/outbox, PII retention, broad accessibility/security/load review and CI/deployment certification are not verified. Lint reports three react-refresh warnings (two existing, one new provider export). Phase 1C remains a separate catalog implementation request and gate.
