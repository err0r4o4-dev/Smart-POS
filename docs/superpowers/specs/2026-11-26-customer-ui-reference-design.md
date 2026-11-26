# Customer UI Reference Redesign (UI-only)

- **Date**: 2026-11-26
- **Status**: Approved by the user on 2026-11-26
- **Reference**: the user's nine-screen board, saved as
  [2026-11-26-customer-ui-reference-board.png](2026-11-26-customer-ui-reference-board.png)
  (Home, Restaurant Discovery, Area Discovery, Area Detail, Restaurant
  Storefront, Menu Detail, Cart & Checkout, Payment, Order Tracking).

## Intent and why

The customer-facing pages should look and flow like the reference board: a warm
gold, photo-led food marketplace with one shared header. The home page (`/`) was
just rebuilt (commit `f44e91c fix-screen-main`) and is the visual anchor. Every
other customer page may be rewritten or removed to match it.

This pass changes only the UI. It uses data the API already returns and does not
invent data the backend lacks.

## Goals

- Restyle the existing customer pages to match screens 2, 5, 7, 8 and 9.
- Add the missing screens 3 (areas), 4 (area detail) and 6 (menu detail dialog).
- Give all customer pages except `/` one shared header that matches the reference.
- Generate real photographic images for the area banners and store covers.
- Keep Thai as the default language, with English in the same change.

## Non-goals

- The home page: `LandingPage.tsx`, `landing.css` and `i18n/landing.ts` stay as
  they are.
- Backend, OpenAPI, database or migration changes.
- Spice level or topping options (the modifier API is not exposed to the storefront yet, T1.2/T3.7).
- Real PromptPay and automatic payment verification (T3.3).
- Area or market registry data (T6.1), distance or location filtering.
- Order history and the in-progress, completed and cancelled tabs (needs member accounts, T6.4).

## Anti-goals (a failure even if it looks right)

- Showing invented data: fake QR codes, fake ratings or review counts, fake
  distances, a fake "verified automatically" payment state, or a fake shop count
  presented as "in this area".
- Breaking the existing cart, quote, dine-in table QR, guest draft, private
  tracking token, payment return or review behavior.
- Removing keyboard access, focus visibility, screen-reader labels or
  non-color-only status cues that the current pages have.

## Constraints

- Stack: React and TypeScript in `apps/web`, React Router, TanStack Query, lucide
  icons, existing tokens and the warm-gold theme. No new dependency.
- Public data available:
  - `ShopDirectoryEntry`: `slug`, `name`, `accepting_orders`, `business_type`,
    `delivery_enabled`, `average_rating`, `review_count`.
  - `ShopSettings`: `description`, `contact_phone`, `pickup_instructions`,
    `delivery_enabled`, `shipping_fee`.
  - `ShopProduct`: `image_url`, category, price, stock policy, sold-out state.
  - `OnlineOrder`: items, totals, status and `events`.
- Payment today is a Stripe test checkout started from the tracking page.
- `TODO.md` has unrelated in-progress sections. Add a separate section for this
  work and leave the other sections untouched.

## Approaches considered

1. **Restyle existing pages and add only the missing screens (chosen by the
   user).** Keeps the proven data and safety logic and its tests. Rewrites the JSX
   and CSS to match the reference. Some text and structure assertions in tests
   change.
2. **Rebuild the customer pages from scratch.** Cleaner structure, but it
   re-implements cart, dine-in, tracking and review logic with a high regression
   risk for no user-visible gain. Rejected.

## Design

### Routes

| Screen        | Route                                       | Status                                 |
| ------------- | ------------------------------------------- | -------------------------------------- |
| 1 Home        | `/`                                         | unchanged                              |
| 2 Discovery   | `/shop`                                     | restyle `StorefrontPage` (`ShopEntry`) |
| 3 Areas       | `/areas`                                    | new                                    |
| 4 Area detail | `/areas/:areaId`                            | new                                    |
| 5 Storefront  | `/shop/:slug`                               | restyle `ShopCatalog`                  |
| 6 Menu detail | dialog on `/shop/:slug`                     | new                                    |
| 7 Cart        | `/shop/:slug/cart` (`/checkout` alias kept) | restyle `ShopCartPage`                 |
| 8 Payment     | payment panel on the tracking page          | restyle                                |
| 9 Tracking    | `/shop/:slug/orders/:orderId`               | restyle `ShopTrackingPage`             |

The `/areas` routes share the customer layout with `/shop` through a pathless
layout route. Keep the existing `/shop/:slug/track/:orderId` redirect and query
parameters (`?q=`, `?type=`, `?view=cart`, `?table=`).

### Shared customer header (all pages except `/`)

Brand, then Home (`/`), Explore stores (`/shop`), Areas (`/areas`), Food
categories (`/#landing-categories`), the language switcher, Cart (only inside a
shop, with the item count), For merchants (`/#for-merchants`), and Sign in, which
becomes Go to workspace when signed in. On mobile these go into a
disclosure menu like the home page's. It replaces the current `StorefrontLayout`
header. The footer and the assistant chat stay.

### Screen 2: Restaurant discovery (`/shop`)

- Title "สำรวจร้านอาหาร", a search field and a sort select (Recommended, Open
  first, Name).
- Filter chips: All, Open now, Favorites (uses the existing directory favorites).
- Left sidebar on desktop, horizontal scroll on mobile: business types derived
  from the data, as today.
- A grid of shop cards: cover photo by business type, open or closed badge with
  text, favorite heart, name, rating only when the API returns a valid one,
  delivery tag only when `delivery_enabled`.
- `?view=cart` still lists stores with a View cart action.

### Screen 3: Areas (`/areas`)

- Title "พื้นที่และชุมชน", a search field that filters the four areas locally,
  and a 2-column grid of photo banner cards (name, description, arrow).
- The four areas come from a static list that reuses the existing
  `landing.area*` translation keys.

### Screen 4: Area detail (`/areas/:areaId`)

- Photo hero with a back link, the area name and description.
- No API maps stores to areas. The page lists all published stores, with the
  same chips and cards as screen 2, under a visible note that store-to-area
  matching is not available yet. **Builder's call:** this is more honest than
  name matching, which almost always returns nothing. There is no "N stores in
  this area" badge. The hero shows the number of stores listed.
- An unknown `areaId` shows the existing not-found treatment.

### Screen 5: Storefront (`/shop/:slug`)

- Wide cover photo (by business type), a round logo badge (store icon, since
  there is no logo field), the name, open status, and rating from the cached
  directory entry when it is present.
- Tabs: Menu, Store info (description, phone, pickup instructions, delivery and
  shipping fee), Reviews (aggregate rating only, or "no reviews yet", because
  there are no text reviews).
- The category sidebar becomes horizontal chips above a product card grid. The
  dine-in table hero stays.
- Products without `image_url` keep a neutral placeholder. No stand-in food photos.

### Screen 6: Menu detail dialog

- Opens from a product card. Native `<dialog>`, focus moves into it, Escape
  closes it, and focus returns to the card.
- Photo, name, variant, price, category, sold-out state, a quantity stepper and
  Add to cart. It reuses the existing quantity and stock validation exactly
  (whole or fractional units, remaining stock, maximum line quantity).
- No spice or topping controls.

### Screen 7: Cart and checkout

- Two columns on desktop, stacked on mobile. Left: "ตะกร้าของคุณ", store name,
  item rows with a thumbnail, stepper and delete. Right: fulfillment option cards
  (Pickup; Dine-in, enabled only from a table QR; Delivery, only when enabled),
  contact fields, totals, and the primary button.
- All quote, pending-order, guest draft and table logic stays as it is.

### Screen 8: Payment (tracking page panel)

- Layout follows the reference: a payment card on the left and an order summary
  on the right.
- A clear "Test mode" badge. The existing Start, Recover and Check status
  actions and the Stripe test link validation stay as they are. No QR image is
  shown and no automatic-verification wording is used.

### Screen 9: Order tracking

- Title "คำสั่งซื้อของฉัน". One order card: thumbnail, store name, order number,
  item count and total, and a vertical status timeline built from `events`
  (each step labeled with text and time, not color alone).
- No tabs. The privacy notice, review panel and refresh action stay.

### Images (generated through 9router, about 8 requests)

- 4 wide area banners: campus, market, dorm, community.
- 4 store covers: restaurant, cafe, fast food, bakery.
- Save under `apps/web/public/images/customer/`. Convert to WebP of about 150 KB
  or less, using the local browser canvas, so no new dependency is needed. Note
  them as AI-generated on the existing photo-credits page.
- Review each image before use. If generation fails, report it and do not retry
  in a loop.

### Visual system

Warm gold primary, white rounded cards (about 16px radius), soft shadows,
existing tokens and fonts, and lucide icons. Touch targets are at least 44px.
Check at desktop (1440) and mobile (390) widths.

## Verification

- Test first for each screen: update or add Vitest tests for the new structure
  and behavior (header links, areas filtering, unknown area, dialog focus and add
  to cart, fulfillment availability, timeline, test-mode badge).
- Web format check, lint, typecheck, Vitest and production build.
- Update the affected Playwright specs (`shop-directory`, `shop-customer-ui`,
  `legacy-tracking-bookmark`) and run them where the environment allows. Report
  any that cannot run.
- Take rendered screenshots at desktop and mobile widths, and check that `/` is
  unchanged.

## Delivery order

0. Generate and convert images.
1. Shared header, layout and routes.
2. Discovery.
3. Areas and area detail.
4. Storefront and menu dialog.
5. Cart.
6. Tracking and payment.
7. Full verification and cleanup.

## Calls settled after the builder check (builder's calls, user may override)

1. **Product card keeps quick add.** Each card keeps its stepper and Add button,
   and gains a separate "View details" button that opens the dialog. This
   avoids nesting interactive elements, keeps the e2e add flow, and the dialog
   shares the card's quantity validation through one extracted hook.
2. **Image set.** The user asked for newly generated images. There is no
   NOODLES business type, so the four covers are restaurant (RESTAURANT,
   RETAIL and unknown types), cafe (CAFE and BAR), fast food (FAST_FOOD) and
   bakery (BAKERY). There is no noodles cover.
3. **Payment and tracking on one page.** For an unpaid PENDING order, a
   payment row (test-mode payment card on the left, order summary on the
   right) sits above the tracking card. Otherwise only the tracking card is
   shown.
4. **Timeline.** The full sequence PENDING → PREPARING → READY → COMPLETED.
   Steps not reached yet are marked pending in text. REJECTED, CANCELLED and
   EXPIRED end the timeline with a final step labelled with that status.
5. **Order card thumbnail.** Orders carry no image, so the card shows a neutral
   icon badge. It does not use a stand-in photo.

## Left to the builder

CSS file organization, component split, exact spacing, the image prompts, and
the translation key names.
