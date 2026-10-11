---
name: smartpos-ui-guidelines
description: Design or adjust SmartPOS visual hierarchy, styling, shared UI, and responsive layouts while preserving runtime tokens, local fonts, Lucide icons, and efficient retail workflows. Use for visual changes, not backend-only work or an unsolicited redesign.
---

# SmartPOS UI Guidelines

## Source of truth

Read `AGENTS.md`, `apps/web/src/styles/tokens.css`, affected styles/components,
and layouts before choosing visual values. All paths are repository-root relative.
Runtime CSS owns tokens; do not maintain another palette in this skill.

## Workflow

1. Identify the user task, workspace, information density, and affected states.
2. Search UI primitives and domain patterns before creating component variants.
3. Reuse semantic tokens and Tailwind mappings for colors, typography, radii, and
   depth. Follow existing spacing/layout conventions. Add a token only for a
   concrete reusable need within the requested change.
4. Prioritize readable prices, quantities, status, totals, and primary actions.
   Operational screens need efficiency, not compulsory landing-page decoration.
5. Adapt desktop/tablet/mobile structure to content. Check narrow layouts, touch
   targets, Thai text, tables, dialogs, and persistent action areas.
6. Verify rendered results when possible. Do not claim pixel fidelity without an
   actual reference and browser evidence.

## Design boundaries

- Preserve yellow branding, local Inter/Noto Sans Thai fonts, and Lucide unless
  redesign is explicitly requested. Do not import skills banning existing choices.
- Use consistent surfaces and calm hierarchy. Glass, shadows, cards, and motion
  are optional. Do not obscure amounts, checkout status, or critical feedback.
- Respect reduced-motion preferences; motion must not delay operational actions.
- Use semantic HTML, labels, logical headings, visible keyboard focus, and useful
  errors. Never communicate meaning only through color or an icon.
- Check actual foreground/background contrast, including brand, error, warning,
  and disabled states. Token reuse does not itself prove accessibility.
- Preserve reachable loading/empty/validation/failure states. Do not imply that
  planned commerce features work by filling them with misleading mock activity.
- References guide composition, not authorization for new dependencies, business
  features, or unrelated redesign. No LostLink/Pinto directory is required.

## Verification and output

Use `smartpos-frontend` for behavior and `smartpos-ui-verification` for rendered
checks. Choose representative narrow/mobile, tablet, and desktop sizes based on
actual layout, not an unrelated imposed breakpoint system.

Report reuse decisions, affected token/component consumers, responsive behavior,
and evidence/limits. Styling scope does not imply a global token rewrite or audit.
