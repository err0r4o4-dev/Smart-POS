---
name: smartpos-ui-guidelines
description: Design or adjust SmartPOS Apple-inspired web UI, adaptive Cupertino-style mobile layouts, visual hierarchy, and shared controls while preserving runtime tokens, local fonts, Lucide icons, and efficient retail workflows. Use for visual changes or Apple-style design requests, not backend-only work or an unsolicited redesign.
---

# SmartPOS UI Guidelines

## Source of truth

Read `AGENTS.md`, `apps/web/src/styles/tokens.css`, affected styles/components,
and layouts before choosing visual values. All paths are repository-root relative.
Runtime CSS owns tokens; do not maintain another palette in this skill.

## Apple-inspired web direction

Use Apple-inspired clarity, restraint, hierarchy, and responsive feedback as the
default direction for requested SmartPOS visual work. This is a project design
preference, not a requirement to reproduce Apple products or native platform UI.
Apply it only to the authorized pages/components; do not restyle the application
or change tokens simply because this skill is loaded.

- Keep interfaces calm and readable with deliberate spacing, clear typography,
  consistent alignment, and one obvious primary action per task area. Balance
  breathing room with efficient operational density; avoid oversized headings,
  decorative bento grids, and card-inside-card layouts on data-heavy POS screens.
- On desktop, use the existing application shell, sidebar/toolbars, broad content
  areas, and efficient tables or grids. Keep pointer and keyboard workflows fast;
  do not constrain the whole application to a phone-width column or add fake
  macOS window chrome.
- On tablet/mobile, adapt the same identity into touch-oriented Cupertino-style
  controls, navigation, and dialogs. Reflow content and prioritize actions rather
  than shrinking desktop UI. Keep the same routes, permissions, and business flow;
  do not create a second navigation system or require a native iOS framework.
- Reuse existing button, field, segmented-control, status, and dialog patterns.
  Preserve familiar web semantics, visible interaction states, and concise labels.
  Use rounded shapes from existing tokens, not pill shapes for every container.
- Preserve SmartPOS yellow branding, local Thai/Latin font coverage, and Lucide.
  Do not switch to Apple blue, SF Pro, SF Symbols, or an imported component library
  just to communicate Apple inspiration.

## Materials and motion

- Prefer solid, readable surfaces for tables, forms, prices, stock quantities,
  receipts, totals, and checkout confirmation. Use subtle borders and depth only
  to clarify grouping and layering, not to make every region a floating card.
- Use glass/translucency selectively on navigation or floating overlays when it
  improves separation. Apple inspiration does not require Liquid Glass everywhere.
  Preserve text contrast over changing backgrounds and a solid fallback when
  transparency or blur is unsupported or inappropriate. Never place critical
  amounts or validation feedback on an unreliable translucent surface.
- Keep motion brief and purposeful for state changes, selection, or opening and
  closing overlays. Prefer transform/opacity and existing motion conventions;
  do not introduce a second animation system or invent a numeric token scale here.
  Honor reduced motion and keep all content/actions usable without animation.

## Workflow

1. Identify the user task, workspace, information density, affected states, and
   Apple-inspired composition appropriate to the requested scope.
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

For cross-platform requirements or adaptive layout changes, use
`.agents/skills/smartpos-cross-platform-design/SKILL.md` to select browser/device/
input coverage and check orientation, safe areas, keyboard obstruction, and
fallbacks. Apple-inspired styling does not itself prove platform compatibility.

Report reuse decisions, affected token/component consumers, responsive behavior,
material/motion choices, and evidence/limits. Styling scope does not imply a global
token rewrite, application-wide redesign, or audit.
