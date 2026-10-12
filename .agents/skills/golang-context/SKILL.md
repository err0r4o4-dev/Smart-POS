---
name: golang-context
description: 'Propagate Go request cancellation and bounded deadlines through database and HTTP calls. Use for timeout or request-lifecycle changes.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Context and Deadlines

Identify the caller's context, deadline budget, and cleanup owner. Preserve cancellation through the entire affected call chain.

- Pass context explicitly as the first argument where the existing APIs support it; do not store request contexts in long-lived structs.
- Derive bounded child timeouts only when needed; release their cancellation functions and resources on all exits.
- Use context-aware database and HTTP calls. Do not detach request work with Background/TODO to hide cancellation.
- Context values carry request-scoped metadata, not service dependencies or authority to change tenants.
- Retry only replay-safe operations within the original deadline. Never retry stock/settlement writes without their established idempotency contract.

Read [cancellation](references/cancellation.md) or [HTTP lifecycle](references/http-services.md) for the affected boundary. Select golang-concurrency only when goroutine coordination is involved. Verify cancellation and timeout behavior with existing focused tests; no service startup or production probes are implied.
