---
name: react-best-practices
description: 'Apply React rendering, state and client-fetching performance patterns to affected code. Use for React work; no Next.js or library migration.'
license: MIT
metadata:
  origin: adapted-from-vercel
  upstream: vercel-labs/agent-skills
---

# React Best Practices

Inspect the actual React/router/query stack and affected code before applying a rule. Preserve repository UI direction and existing component/API boundaries.

- Derive simple state during rendering rather than synchronizing redundant state through effects. Put user-triggered operations in event handlers when appropriate.
- Keep server data in the established query/cache layer, not copied into another local store. Include authorized scope in keys, respect cancellation and invalidate affected queries after mutations.
- Parallelize only independent reads. Do not parallelize ordered retail writes or hide partial failures with a successful state.
- Preserve stable identities where they affect effects/subscriptions; clean up listeners, timers and requests. Measure before adding memoization or virtualization.
- Lazy-load heavy optional UI using existing React/Vite patterns when beneficial. Do not introduce Next.js, RSC/server actions, SWR, a new state library or dependencies from community examples.
- Preserve loading, empty, error, denied, pending and success states. Verify rapid input, duplicate submission and stale-response behavior where affected.

Read only the relevant Vercel-derived reference: [independent requests](references/async-parallel.md), [derived state](references/rerender-derived-state-no-effect.md), [functional updates](references/rerender-functional-setstate.md), or [conditional rendering](references/rendering-conditional-render.md).

In SmartPOS use smartpos-frontend for ownership and smartpos-ui-guidelines for visual decisions. Apple-inspired design, runtime tokens, local fonts and Lucide are not replaced by this performance guidance.
