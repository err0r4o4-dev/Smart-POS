---
name: web-design-guidelines
description: 'Inspect web accessibility, forms, keyboard, focus and interaction quality in affected UI. Use for UI review; preserve the project theme.'
metadata:
  origin: local-authored
---

# Web Design Guidelines

Inspect the affected screen and requested states, not every page. A review-only request produces findings without edits.

- Use semantic controls and labels; preserve keyboard operation, visible focus, logical navigation and understandable validation feedback.
- Keep dialogs, menus and overlays operable with the repository's established focus/close patterns. Do not trap users or hide critical actions behind hover alone.
- Provide loading, empty, error, disabled, pending and success feedback. Preserve entered values after recoverable errors and prevent duplicate business submissions.
- Reflow tables/actions deliberately across desktop, tablet and mobile. Keep touch targets usable and allow content growth, Thai text and browser zoom.
- Respect reduced-motion preferences. Do not animate or blur critical prices, quantities, validation messages or confirmation controls into unreadability.
- Preserve the project's design tokens, fonts, icons and interaction conventions instead of importing a design system.

For SmartPOS, smartpos-ui-guidelines owns Apple-inspired/Cupertino-style visual decisions and smartpos-ui-verification owns rendered evidence. Generic web guidance does not authorize a redesign or a security audit.

Read [interaction checks](references/interaction-checklist.md) when the requested UI warrants them. Report exact affected states and separate code inspection from browser evidence.
