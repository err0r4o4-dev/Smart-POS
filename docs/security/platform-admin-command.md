# Platform Admin management command

This local implementation provisions durable platform authority through a server
command. It does not expose a self-service role endpoint or implement the Admin
workspace. Mandatory MFA enforcement on future Admin operations remains a
separate acceptance gate. No real Admin grant, operator account, credential or
deployment was created by this work.

## Operator prerequisites

Use a separately authorized target and database operator identity. Supply its
connection through `PLATFORM_ADMIN_DATABASE_URL` in the operator's secret
mechanism. The command never falls back to `DATABASE_URL`, starts the application
server, or runs migrations. Do not put connection strings in command arguments,
source, shell history, reports or shared files. Do not forward this variable to
the application runtime or browser.

The target must have exactly one clean migration version matching the command
build (currently43). The operator needs SELECT/INSERT/UPDATE on
`platform_admins`, SELECT/INSERT on `platform_admin_audit_events`, SELECT and
row-lock privileges on `users`, SELECT on `auth_mfa_factors` and
`schema_migrations`, and SELECT/UPDATE on `auth_sessions`. Provisioning credentials
and assigning these privileges are separate operational actions requiring target
authorization. A database owner can override database controls; this command does
not protect against an administrator disabling triggers or changing privileges.

Before a grant, the operator must independently verify the intended user ID and
record a minimal reason without secrets or unnecessary personal data. The
database also requires an ACTIVE, email-verified account with an activated,
unrevoked MFA factor. An operator label and reason are assertions, not identity
evidence; audit separately records database `current_user` and `session_user`.
Revocation remains available for disabled, unverified or MFA-less accounts.

## Invocation and outcome

From `apps/api`, build with `go build ./cmd/platform-admin`. The binary accepts
`--operation-id`, `--user-id`, `--action` (`grant` or `revoke`), `--operator` and
`--reason`. UUIDs must be canonical lowercase and nonzero. Without `--apply`, it
validates arguments without reading connection configuration or connecting.
Using `--apply` performs the mutation and requires authorization for that exact
target and grant/revocation. No invocation against a real account is authorized
by this document.

Use one new operation UUID for a new request. Preserve that UUID and every
argument when investigating or retrying an uncertain outcome. Changed arguments
with the same UUID are rejected. A matching retry returns the historical recorded
`active` and `changed` values with `replayed=true`; these describe that operation,
not current authority. An old grant retry cannot reinstate a later-revoked grant.
Inspect current `platform_admins` state through the separately authorized operator
connection when current status is needed. Never invent a new operation ID merely
because an earlier response was lost.

Actual authority transitions revoke all existing target sessions and append the
operation audit in one transaction. Distinct requests already matching current
state append a no-op audit without changing grant timestamps or revoking new
sessions. The audit table rejects UPDATE, DELETE and TRUNCATE. Runtime can SELECT
authority but cannot write authority or read/write this dedicated audit. The
command checks direct/inherited privileges across every direct or indirect role
membership, including dormant memberships without current `SET ROLE` access.
This conservatively rejects privileged memberships whose ADMIN option could
enable that access later, and fails closed if the boundary is broken.

## Recovery and acceptance

Migration43 adds empty authority/audit tables without inferring Admin rights from
existing tenant OWNER memberships. Its downgrade refuses once authority or audit
history exists; retain history and recover with a compatible forward build.
The command does not create database roles, change an account's MFA, transfer
restaurant ownership, implement manual recovery, or silently retry mutations.

Current test/review results and unresolved acceptance are recorded in
[the migration tracker](../../specs/velopos-migration/tasks.md).
