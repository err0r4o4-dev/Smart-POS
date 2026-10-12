---
name: golang-performance
description: 'Investigate measured Go latency, allocation or throughput bottlenecks. Use for requested performance work, not speculative optimization.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Performance

Define the workload, metric, baseline and acceptable tradeoffs before optimizing. Use current benchmark/profile seams and an authorized local or isolated environment.

- Change one measured bottleneck at a time; compare equivalent inputs and report variance, not just a single faster result.
- Preserve behavior, tenant boundaries, exact arithmetic, transaction correctness and cancellation under load.
- Do not add caches, pools, goroutines or denormalized data without a demonstrated need and an invalidation/ownership model.
- Bound cache keys/size/lifetime and resource use. Cached tenant data must retain its scope; stale stock/pricing must not silently become authority for posting.
- Benchmark/profiling commands do not authorize production traffic, data exports, extra dependencies or background services.

Read [memory](references/memory.md) or [caching](references/caching.md) only for an identified bottleneck. Use focused tests to guard semantics before and after optimization. Report baseline, changed metric, verification and remaining uncertainty; do not claim a percentage improvement without measurements.
