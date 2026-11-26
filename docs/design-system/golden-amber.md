# Golden Amber Glass

Canonical source: `apps/web/src/styles/tokens.css`; Tailwind v4 semantic mapping is in that same file. Layout rules consume variables, not independent themes. Light mode only.

Primary #F4C542, hover #E9B52A, active #D5A01E; soft/subtle #FFF7DB/#FFFBEB; strong #854D0E; border #EACB6F. Canvas #F5F5F7, white surfaces, secondary #F3F6FB. Primary text #0F172A, secondary #64748B, strong #526176. Strong semantic colors are used on light backgrounds instead of low-contrast bright icon/status text.

Inter Variable + Noto Sans Thai Variable bundled locally, system sans fallback. Display 48, desktop page 36/mobile 28, section 24, card 18, body 16, caption 14, label 12 px. Larger body/Thai content must retain readable line-height; compact metadata is secondary, never sole status information. Money figures use tabular numerals.

Radii 12/14/20/24/28 px plus pills. Solid cards, subtle shadows. Navigation glass uses 70% white + blur(16px) saturate(140%) where supported, with solid fallback. Never glass large data tables.

Yellow primary buttons use dark text. Semantic HTML, keyboard navigation, visible focus, 44px controls, labeled fields, alerts/loading announcements, reduced-motion support and skip links. Target WCAG AA; browser evidence is not a formal accessibility certification.

Contrast spot checks: primary dark text/yellow 10.98:1; strong text/canvas 5.79:1; amber strong/soft 6.39:1. Secondary text #64748B is 4.76:1 on white but only 4.37:1 on canvas, so default paragraphs, canvas metadata and Tailwind muted semantics use strong text on canvas. Disabled controls are unavailable and are not used to communicate the sole availability message.

Responsive targets: 320, 375, 640, 768, 1024, 1440, 1920 px; max content 1600px. Management sidebar becomes mobile modal navigation. POS selection/cart stacks on narrow screens; auth story/form stacks. Presentations are explicitly unavailable for business actions.
