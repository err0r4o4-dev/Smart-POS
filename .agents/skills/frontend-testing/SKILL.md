---
name: frontend-testing
description: 'Design focused React component and interaction tests with existing Vitest/Testing Library seams. Use for frontend regression coverage and verification.'
metadata:
  origin: local-authored
---

# Frontend Testing

Inspect existing fixtures, providers, router/query setup and test commands before adding coverage. Use the application's current test stack, not a new framework.

- For behavior changes, reproduce the relevant user action or bug before the fix. Query accessible roles/names and assert observable outcomes rather than private component state.
- Cover the affected loading, empty, denied, error, pending and success states. Exercise validation, keyboard actions and duplicate submissions when relevant.
- Stub transport/external boundaries while exercising real component and state behavior. Keep fixture tenant/branch scope explicit and use synthetic data.
- Avoid timing sleeps, brittle class-name assertions and snapshots that only freeze incidental markup.
- Separate component/unit evidence from browser appearance and real integration acceptance. Use smartpos-ui-verification for rendered checks when the environment is available.
- Keep tests intact. Do not install browser tooling, start a stack, migrate or reset data merely to obtain a pass.

Read the [test matrix](references/test-matrix.md) for suitable cases. Discover commands from project scripts, start narrow, and report commands and passed/failed/blocked/not-run status.
