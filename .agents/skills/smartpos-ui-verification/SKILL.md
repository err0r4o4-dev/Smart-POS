---
name: smartpos-ui-verification
description: Verify affected SmartPOS appearance, responsive behavior, and important browser interactions using real rendered pages when available. Use for visual changes or explicit UI checks; distinguish rendered evidence from tests/build and do not start services or write fixtures without authorization.
---

# SmartPOS UI Verification

## Preconditions

Read `AGENTS.md`, the affected diff, routes/workspaces, and existing tests. Paths
are repository-root relative. Verification-only work authorizes reporting, not fixes.

1. Identify routes, user roles/workspaces, reachable states, and viewport coverage.
2. Confirm a suitable authorized environment. Inspect `playwright.config.ts`,
   relevant `tests/e2e` scenarios, and `docs/development/verification.md` first.
3. Inspect startup/fixture behavior: scenarios may create accounts or retail
   records. Use a confirmed isolated target. Do not start the default stack,
   migrate, or use primary data just to obtain screenshots.
4. Use available authorized browser tools or existing Playwright infrastructure.
   If unavailable, report blocked rather than installing/configuring tools.

## Focused checklist

- Inspect representative narrow/mobile, tablet, and desktop layouts. Check
  overflow, clipped content, sticky actions, dialogs, navigation, and Thai wrapping.
  Record dimensions and environment actually used.
- Inspect relevant reachable loading, empty, validation, denied, success, and
  failure states when safe reproduction is possible.
- Exercise relevant keyboard navigation, focus handling, labels, pointer/touch
  actions. Do not settle sales, change stock, or send invitations without a safe
  fixture target and authorized mutation scope.
- Verify readable totals/quantities and clear actions. Visual checks do not prove
  backend authorization or transaction correctness.
- Compare with approved references when supplied. Do not generate a reference and
  treat it as user-approved without confirmation.
- Capture permitted non-sensitive states only. Do not expose customer/employee
  data, receipts, tokens, or primary records through screenshots.

## Commands and delivery

`npm run e2e` runs existing Playwright scenarios and may launch configured servers
or create records. Inspect configuration first; prefer a focused authorized
scenario. Unit tests/typecheck/build complement but do not replace browser evidence.

Report inspected routes/states/viewports, actual interactions, and findings with
locations. Mark checks passed, failed, not run, or blocked. Explicitly state absent
browser/screenshot evidence. Stop only task-created processes within cleanup scope;
do not stop unrelated services or remove volumes.
