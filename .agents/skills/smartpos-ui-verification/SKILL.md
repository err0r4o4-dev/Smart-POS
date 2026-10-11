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

For cross-platform/browser compatibility requests, read
`.agents/skills/smartpos-cross-platform-design/SKILL.md` and select its relevant
matrix entries. Record browser/version, OS/device, viewport, input mode, and
emulated versus real execution. Viewport resizing is not real-device evidence;
report unavailable browser/device combinations as not run or blocked.

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

## Apple-inspired design checks

For affected visual work, read the direction in
`.agents/skills/smartpos-ui-guidelines/SKILL.md`. Verify the rendered result rather
than treating the style name or token reuse as proof that the design succeeds.

- Check clear hierarchy, alignment, restrained decoration, and efficient density.
  Keep POS totals, stock quantities, and primary actions easy to find and read.
- Check desktop uses available width and keyboard/pointer-friendly controls;
  mobile/tablet should reflow content into touch-friendly interactions, not merely
  shrink a desktop layout or introduce another workspace/navigation model.
- Check existing yellow branding, local Thai/Latin typography, and icon consistency
  remain intact unless a different direction was explicitly requested.
- Where glass is used, inspect contrast over varied backgrounds and the solid
  fallback without blur/transparency. Check critical data stays on reliable surfaces.
- Where motion is used, check reduced-motion behavior, visible state feedback, and
  immediate access to actions. Do not require glass or animation for a visual pass.

## Commands and delivery

`npm run e2e` runs existing Playwright scenarios and may launch configured servers
or create records. Inspect configuration first; prefer a focused authorized
scenario. Unit tests/typecheck/build complement but do not replace browser evidence.

Report inspected routes/states/viewports, actual interactions, and findings with
locations. Mark checks passed, failed, not run, or blocked. Explicitly state absent
browser/screenshot evidence. Stop only task-created processes within cleanup scope;
do not stop unrelated services or remove volumes.
