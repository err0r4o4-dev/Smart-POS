---
name: golang-testing
description: 'Design and run focused Go domain, HTTP and integration tests with existing tools. Use for Go tests or regression verification.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Testing

Inspect existing tests and test commands first. Select smartpos-go-testing for SmartPOS prerequisites and isolated integration targets.

- Test observable behavior with table-driven cases and existing httptest/domain seams. For a bug, reproduce the failure before the smallest fix.
- Include relevant invalid, denied, missing, conflict, cancellation and dependency-failure cases, not only the happy path.
- Prefer real domain behavior; stub only external boundaries. Never remove, skip or weaken a test to manufacture a pass.
- Avoid sleeps and shared global fixtures when controllable clocks/synchronization already exist. Do not install a mocking library for convenience.
- Unit/HTTP tests come first; database tests require an isolated target. Imported container/TRUNCATE examples are illustrations, never commands for the primary database.

Read [HTTP tests](references/http-testing.md), [boundary mocking](references/mocking.md), or [integration patterns](references/integration-testing.md) only for the affected test mode. Report commands, passed/failed/blocked/not-run status, and what the evidence does not establish.
