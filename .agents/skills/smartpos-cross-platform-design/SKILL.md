---
name: smartpos-cross-platform-design
description: Design or inspect SmartPOS adaptive web layouts across desktop, tablet, mobile, browser engines, and keyboard/pointer/touch input. Use for cross-platform requirements or responsive compatibility work, not backend-only changes, native apps, PWA implementation, or an unsolicited redesign.
---

# SmartPOS Cross-Platform Design

## Scope and inputs

Read `AGENTS.md`, the affected routes/components/styles, and current diff. Paths
are repository-root relative. This skill defines adaptive web design and coverage;
loading it does not establish compatibility or authorize a broader implementation.
Read-only requests remain read-only. Preserve existing workspace and permission
boundaries; do not create a second mobile application or navigation model.

- Use `.agents/skills/smartpos-ui-guidelines/SKILL.md` for Apple-inspired identity
  and `apps/web/src/styles/tokens.css` for actual visual tokens. Keep the existing
  yellow branding, local Thai/Latin fonts, and Lucide unless redesign is requested.
- Use `.agents/skills/smartpos-frontend/SKILL.md` for requested behavior changes and
  `.agents/skills/smartpos-ui-verification/SKILL.md` for authorized rendered checks.
- Inspect `playwright.config.ts`, relevant `tests/e2e` scenarios, and
  `.github/workflows/ci.yml` before describing automated browser/device coverage.
  Existing viewport tests are evidence of intended checks, not proof they passed.

## Choose a coverage matrix

For a broad cross-platform request, propose the following target matrix. For a
localized change, select affected combinations and explain omissions; do not run
every combination or change test/CI configuration merely by loading this skill.

| Target                           | Representative browser/input                                         | Important checks                                             |
| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Windows/Linux desktop            | Chrome/Chromium, Edge where available, Firefox; keyboard and pointer | Navigation, tables, focus, short-height screens, zoom        |
| macOS desktop                    | Safari plus requested browsers; keyboard and pointer                 | Actual Safari behavior, fonts, overlays, effects fallback    |
| iPhone                           | Safari; touch and on-screen keyboard                                 | Narrow layout, safe areas, keyboard obstruction, orientation |
| Android phone                    | Chrome; touch and on-screen keyboard                                 | Navigation, forms, sticky actions, scrolling, orientation    |
| iPad/Android tablet or touch POS | Safari/Chrome as applicable; touch and optional keyboard             | Portrait/landscape reflow, dense workflows, dialogs          |

Browser emulation does not prove actual OS/device behavior. Chromium is not a
separate pass for branded Chrome or Edge; WebKit is not a real Safari-device pass.
Record browser/version, OS/device, viewport, input mode, and emulated versus real
execution for evidence actually collected. Mark unavailable combinations not run
or blocked instead of claiming support for every platform.

## Adaptive layout and interaction

1. Identify the task, workspace, critical data/actions, and affected states. Adapt
   composition to content and available space, not device-name detection. Preserve
   routes, permission presentation, and the same business flow across sizes.
2. On desktop, retain useful content width, efficient tables, keyboard shortcuts
   where already supported, and the current shell. On mobile/tablet, reflow grids,
   navigation, dialogs, and actions rather than shrinking the desktop screen.
3. Inspect actual breakpoints and test just below/above changed boundaries. Use
   relevant widths from existing tests (320, 375, 640, 768, 1024, 1440, 1920 CSS px)
   plus realistic heights and portrait/landscape where affected. This is a coverage
   starting point, not a new required breakpoint or spacing-token system.
4. Keep totals, quantities, validation, and primary actions readable and reachable.
   Contain necessary wide-table scrolling within its region, retain field labels
   in compact views, and do not silently hide information needed for a decision.
5. Support semantic controls, visible keyboard focus, logical focus order, escape
   and focus restoration for overlays, and practical separated touch targets.
   Do not make an action hover-only or disable browser zoom. Check Thai wrapping,
   long labels, enlarged text/zoom, and relevant screen-reader naming.
6. Where edge-to-edge or sticky layouts need it, account for safe-area insets and
   viewport changes from browser chrome or the on-screen keyboard. Use progressive
   enhancement and fallbacks suited to target browsers; avoid global CSS changes
   for an isolated issue. Verify controls remain reachable while typing/scrolling.
7. Preserve reduced-motion behavior, sufficient contrast, and solid fallbacks for
   glass/blur. Apple inspiration is a visual direction, not an iOS-only contract;
   retain familiar web interactions on Windows, Linux, and Android too.

## POS and capability boundaries

- Preserve entered data and honest loading/error/retry states for affected flows.
  Do not imply an offline sale succeeded, automatically retry settlement/refund,
  queue stock writes, or change backend idempotency to improve mobile UX. Such
  behavior needs a separately approved business/API/data change.
- If printing or hardware is in scope, distinguish browser print layout from
  actual receipt-printer, scanner, cash-drawer, and OS integration evidence.
  Do not promise peripheral support from responsive screenshots alone.
- Native apps, installation/PWA, service workers, authenticated offline caching,
  new dependencies, test-browser installation, and CI expansion are separate
  scopes. Propose them when needed; this skill does not authorize them.

## Verification and delivery

Use an authorized isolated environment and inspect test fixture writes before
browser execution. Choose focused existing checks; do not start a migrating stack
or use primary/customer data merely to fill the matrix. Preserve user work and
do not delegate or change agent configuration through this skill.

Report affected paths/routes/states and the selected matrix. Separate static
inspection, unit/build checks, automated browser checks, emulation, and real-device
evidence. Include findings, missing coverage, and passed/failed/not-run/blocked
results. Do not label a feature cross-platform verified from a build, viewport
resize, or screenshot alone.
