# Security model

Phase 1A implements global identity endpoints and a protected account page. The Phase 0 auth preview remains presentation-only; no tenant-data endpoints are exposed. Frontend guard defaults deny; backend independently validates the session for authenticated API access.

Phase 1A uses Argon2id with random salts and bounded input, hashed random session tokens in PostgreSQL, a 24-hour default absolute expiry (configurable 1-720 hours), revocation, HttpOnly/SameSite=Lax cookies and Secure `__Host-` cookies in production HTTPS. Authenticated writes check the allowed Origin and a per-session CSRF header. Public auth writes check Origin and JSON input; PostgreSQL counters limit login to five attempts per account/IP in ten minutes and other auth requests by scope. One-time hashed reset tokens expire in 15 minutes; reset atomically changes the password and revokes sessions. Neither session nor reset tokens are stored in browser storage or application logs. No session rotation endpoint is implemented or required for the fixed-expiry design.

Password reset responds generically for unknown accounts and SMTP delivery failures; operators must monitor delivery failures. Delivery timing may still differ, and the IP bucket currently sees the Caddy proxy peer rather than the originating browser, potentially throttling different clients together. The rate limit is deliberately not relaxed to hide this limitation. These require a trusted-proxy design and verification before production. Local Mailpit is development-only; configure authenticated TLS SMTP in production.

Phase 1B will define OWNER, MANAGER, CASHIER, INVENTORY_STAFF and PURCHASING_STAFF roles. Tenant membership/branch grants are not yet implemented or asserted by the auth session.

Queries scope tenant/branch; composite FKs/non-owner RLS add defense. Audit actor/action/object/outcome/request ID without secrets. Define personal-data retention/access before collection.

Phase 0: loopback ports, internal AI without DB credentials, bounded timeouts, generated IDs, generic errors, safe panic recovery, security headers/CSP, non-root app containers, named PostgreSQL volume.

Local bootstrap DB user is privileged and not production-safe. No compliance/hardening claim. Production needs secret management, least privilege, TLS/cookies, threat review, scanning, abuse controls, retention and verified backups. Never expose local Compose publicly.
