---
name: golang-concurrency
description: 'Implement or inspect bounded Go goroutines, channels and synchronization. Use for races, worker lifecycles or concurrent behavior.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Concurrency

Establish why concurrency is necessary, who owns each goroutine/channel, and how work stops. A mention of concurrency does not authorize agent delegation.

- Bound fan-out and queue sizes; use the caller context and wait for owned work to stop.
- Prefer existing synchronization patterns. Use channels for ownership/coordination and mutexes where shared state genuinely requires them.
- Close channels from the sender/owner, not an arbitrary receiver. Avoid sends after cancellation, goroutine leaks, and lock cycles.
- Do not share transaction handles or tenant/request state across unrelated work. Keep retail posting atomic rather than parallelizing transaction steps.
- Exercise failure, cancellation and concurrent access with the repository's existing tests; use race checks only with the appropriate environment.

Read [synchronization](references/sync-primitives.md) or [pipelines](references/pipelines.md) only for the requested mechanism. Community examples do not authorize new dependencies, services, or unbounded workers.
