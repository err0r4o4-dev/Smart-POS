# Security model

No auth or tenant-data endpoints in Phase 0. Auth preview is disabled. Frontend guard defaults deny; backend must independently enforce all future access.

Phase 1: Argon2id reviewed parameters/salts/bounded input; revocable sessions, rotation, HttpOnly/Secure/SameSite cookies, CSRF + Origin checks, expiry, rate limiting, enumeration-safe errors. Roles: OWNER, MANAGER, CASHIER, INVENTORY_STAFF, PURCHASING_STAFF. Tenant membership/branch grants are server-authoritative.

Queries scope tenant/branch; composite FKs/non-owner RLS add defense. Audit actor/action/object/outcome/request ID without secrets. Define personal-data retention/access before collection.

Phase 0: loopback ports, internal AI without DB credentials, bounded timeouts, generated IDs, generic errors, safe panic recovery, security headers/CSP, non-root app containers, named PostgreSQL volume.

Local bootstrap DB user is privileged and not production-safe. No compliance/hardening claim. Production needs secret management, least privilege, TLS/cookies, threat review, scanning, abuse controls, retention and verified backups. Never expose local Compose publicly.
