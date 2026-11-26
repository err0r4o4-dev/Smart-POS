# Customer UI Reference Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the customer pages and add the missing area and menu-detail screens so that `/shop`, `/areas` and the store, cart and tracking pages match the nine-screen reference board, using only data the API already returns.

**Architecture:** One shared `CustomerHeader` inside `StorefrontLayout` serves `/shop/*` and `/areas/*` through a pathless layout route. Existing pages keep their hooks, queries and safety logic. Only their JSX and CSS change. New screens are `AreasPage`, `AreaDetailPage` and `MenuItemDialog`. Directory cards are extracted into `ShopCard`, which both `/shop` and area detail reuse.

**Tech Stack:** React 19, TypeScript, React Router 7, TanStack Query, lucide-react, Vitest with Testing Library, Playwright 1.64, and plain CSS with the existing tokens.

**Spec:** [docs/superpowers/specs/2026-11-26-customer-ui-reference-design.md](../specs/2026-11-26-customer-ui-reference-design.md). Visual reference: [2026-11-26-customer-ui-reference-board.png](../specs/2026-11-26-customer-ui-reference-board.png). Open it with the Read tool before each UI task.

## Global Constraints

- Do not edit `apps/web/src/features/landing/LandingPage.tsx`, `landing.css` or `i18n/landing.ts`. The new code may read `landing.*` keys and `/images/home/reference/*`.
- No backend, OpenAPI, migration or `package.json` change. No new dependency.
- No invented data: no QR image, rating, review count, distance, area store count or "verified automatically" text. Show a rating only when `average_rating` is in 1–5 and `review_count` is a safe integer greater than 0 (the same rule as `RecommendedShops`).
- Keep the cart, quote, guest draft, `?table=` token, private `#access=` tracking token, `payment_return` restore, Stripe test-link validation and review behavior unchanged.
- Thai is the default. Add each new string to `apps/web/src/i18n/storefront.ts` in both `th` and `en`, under a new `storefront.customer` group. Do not add new inline `language === 'th' ? … : …` ternaries.
- Touch targets are at least 44px. Focus stays visible. Status has a text cue as well as color. There is no horizontal page scroll at 320, 390, 768 or 1440px.
- Images live in `apps/web/public/images/customer/`. Each is WebP and no larger than 150 KB. Every image is listed in `apps/web/public/images/home/photo-credits.html` as "AI-generated (9router cx/gpt-image-2), 2026-11-26".
- Each image generation is a real billable request. Run at most one request per image, plus one retry only after a visible quality failure. If a request fails, stop and report it.
- `TODO.md`: add a separate `## Customer UI reference redesign` section. Do not edit the existing sections.
- Do not stage or commit unless the user asks. Treat the "Commit" step in each task as a checkpoint where you run `git status --short` and confirm that only that task's files changed.

## Review Focus

1. **Area id in the URL.** `/areas/unknown` or `/areas/%3Cscript%3E` should render the existing not-found message with a link back to `/areas`, without a crash or an echo of raw HTML. Test in Task 4.
2. **Product dialog after stock changes.** When a product's remaining quantity is 0 because the cart already holds all stock, the dialog's Add button is disabled and shows the existing "all available quantity is already in your cart" message. Test in Task 5.
3. **Dine-in table link on the new header.** The header Cart link and the brand link inside `/shop/:slug?table=T` keep `?table=T`. Losing it breaks dine-in ordering. Test in Task 2.
4. **Directory with no rating data.** A shop with `average_rating: null` and `review_count: 0` shows "no reviews yet". A shop whose rating fields are missing shows nothing. A shop with an out-of-range rating (for example 7) shows no rating. Test in Task 3.
5. **Tracking with an unpaid PENDING order on a phone.** The test-mode payment card and the order summary stack, and the Start payment button stays reachable at 320px. Test in Task 7 (Playwright).

---

## File Structure

| File                                                                                             | Responsibility                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/web/src/features/storefront/customer-areas.ts` (new)                                       | Static list of the 4 areas: id, translation keys, banner image.                            |
| `apps/web/src/features/storefront/shop-art.ts` (new)                                             | `shopCoverImage(type)` and `hasValidRating(entry)`.                                        |
| `apps/web/src/features/storefront/CustomerHeader.tsx` (new)                                      | Shared customer navigation for desktop and the mobile disclosure.                          |
| `apps/web/src/features/storefront/ShopCard.tsx` (new)                                            | Directory shop card: cover, status, favorite, rating, delivery.                            |
| `apps/web/src/features/storefront/ShopDirectoryGrid.tsx` (new)                                   | Chips, sort, type sidebar and card grid. Used by `/shop` and area detail.                  |
| `apps/web/src/features/storefront/AreasPage.tsx` (new)                                           | Screens 3 and 4.                                                                           |
| `apps/web/src/features/storefront/MenuItemDialog.tsx` (new)                                      | Screen 6.                                                                                  |
| `apps/web/src/features/storefront/customer.css` (new)                                            | Styles for the header, cards, areas, dialog, storefront tabs, cart, payment and timeline.  |
| `apps/web/src/layouts/StorefrontLayout.tsx`                                                      | Uses `CustomerHeader`. The footer and assistant stay.                                      |
| `apps/web/src/app/router.tsx`, `route-pages.tsx`, `routes.ts`                                    | `/areas` routes under the shared layout and `paths.areas`.                                 |
| `apps/web/src/features/storefront/StorefrontPage.tsx`                                            | `ShopEntry` becomes the screen-2 layout using `ShopDirectoryGrid`.                         |
| `apps/web/src/features/storefront/ShopCatalog.tsx`                                               | Screen-5 hero and tabs. The category chips replace the sidebar, and cards open the dialog. |
| `apps/web/src/features/storefront/ShopCartPage.tsx`                                              | Screen-7 layout: fulfillment option cards. Logic is unchanged.                             |
| `apps/web/src/features/storefront/ShopTrackingPage.tsx`, `OrderDetails.tsx`                      | Screens 8 and 9: order card, vertical timeline and test-mode payment card.                 |
| `apps/web/src/i18n/storefront.ts`                                                                | The `customer` message group, in Thai and English.                                         |
| `apps/web/public/images/customer/*.webp`, `photo-credits.html`                                   | Generated images and credits.                                                              |
| `tests/e2e/shop-directory.spec.ts`, `shop-customer-ui.spec.ts`, new `customer-reference.spec.ts` | Browser layout checks.                                                                     |

---

### Task 0: Generate and convert images

**Files:**

- Create: `apps/web/public/images/customer/area-campus.webp`, `area-market.webp`, `area-dorm.webp`, `area-community.webp`, `cover-restaurant.webp`, `cover-cafe.webp`, `cover-fast-food.webp`, `cover-bakery.webp`
- Create (temporary, deleted at the end of the task): the `.png` sources in `%TEMP%\customer-art\`
- Modify: `apps/web/public/images/home/photo-credits.html`

**Interfaces:**

- Produces: the 8 public URLs `/images/customer/<name>.webp` used by Tasks 1, 3, 4 and 5.

- [ ] **Step 1: Generate the 4 area banners (1536x1024).** For each area, run `pwsh -File C:\Users\title\.claude\scripts\gen-image.ps1 -Size 1536x1024 -Out "$env:TEMP\customer-art\<name>.png" -Prompt "<prompt>"`. The prompts are photographic, warm late-afternoon light, no text, no logos and no people's faces in focus:
  - `area-campus`: "Thai university campus street with low academic buildings, trees and food stalls at the roadside"
  - `area-market`: "Thai open-air university market with food stalls, string lights, plastic stools"
  - `area-dorm`: "Thai student dormitory buildings with a small street-food row in front"
  - `area-community`: "Thai canal-side community with wooden shophouses and small food shops"
- [ ] **Step 2: Generate the 4 store covers (1536x1024).** Use the same command.
  - `cover-restaurant`: "overhead Thai made-to-order dishes, stir-fried basil pork with fried egg, on a warm wooden table"
  - `cover-cafe`: "Thai milk tea and coffee in clear cups on a bright cafe counter"
  - `cover-fast-food`: "Thai-style fried chicken and fries in paper baskets"
  - `cover-bakery`: "fresh Thai bakery display with toast, buns and small cakes on a wooden counter"
- [ ] **Step 3: Review each PNG with the Read tool.** Reject an image if it contains readable text, a watermark, a brand logo, distorted food or an identifiable face. Regenerate each rejected image once at most. If it still fails, report it and use `/images/home/reference/*` for that slot.
- [ ] **Step 4: Convert to WebP of 150 KB or less.** There is no `sharp`, `cwebp` or ImageMagick installed. Convert with the Playwright browser that is already installed: write a temporary Node script in `%TEMP%\customer-art\convert.mjs` that opens each PNG in Chromium, draws it on a canvas at 1200px wide, and exports `canvas.toDataURL('image/webp', 0.72)`. Lower the quality in 0.08 steps until the file is 150 KB or less. Write the files to `apps/web/public/images/customer/`.
- [ ] **Step 5: Verify the sizes.** Run `Get-ChildItem apps/web/public/images/customer/*.webp | Select Name,Length`. Expected: 8 files, each with a `Length` of 153600 or less.
- [ ] **Step 6: Add credit entries** to `photo-credits.html`, in the existing `<li>` format, one for each file.
- [ ] **Step 7: Delete `%TEMP%\customer-art\`** (agent-owned temporary files only). Checkpoint: `git status --short` shows only the new `images/customer/` files and `photo-credits.html` for this task.

---

### Task 1: Data helpers and messages

**Files:**

- Create: `apps/web/src/features/storefront/customer-areas.ts`, `shop-art.ts`, `shop-art.test.ts`
- Modify: `apps/web/src/i18n/storefront.ts`

**Interfaces:**

- Produces:
  - `type CustomerArea = { id: 'campus' | 'market' | 'dorm' | 'community'; title: TranslationKey; description: TranslationKey; image: string }`
  - `customerAreas: readonly CustomerArea[]`, in the order campus, market, dorm, community. The keys reuse `landing.areaCampus`, `landing.areaCampusDescription` and so on.
  - `findCustomerArea(id: string | undefined): CustomerArea | undefined`
  - `shopCoverImage(type: string): string`: `CAFE`/`BAR` → cover-cafe, `FAST_FOOD` → cover-fast-food, `BAKERY` → cover-bakery, `RESTAURANT`, `RETAIL` and any other value → cover-restaurant. The input is already normalized.
  - `hasValidRating(entry: Pick<ShopDirectoryEntry,'average_rating'|'review_count'>): entry is {average_rating:number; review_count:number}`
  - Message keys under `storefront.customer.*` (Thai and English). Add them in the task that first uses them. This task adds `navHome`, `navExplore`, `navAreas`, `navCategories`, `navMerchants`, `cart`, `signIn`, `goToWorkspace`, `menu`.

- [ ] **Step 1: Write failing tests** in `shop-art.test.ts`:
  - `findCustomerArea('campus')?.image === '/images/customer/area-campus.webp'`. `findCustomerArea('nope')` and `findCustomerArea(undefined)` return `undefined`. `findCustomerArea('__proto__')` returns `undefined`.
  - `shopCoverImage('CAFE')` and `shopCoverImage('BAR')` end with `cover-cafe.webp`. `shopCoverImage('BAKERY')` ends with `cover-bakery.webp`. `shopCoverImage('')` and `shopCoverImage('RETAIL')` end with `cover-restaurant.webp`.
  - `hasValidRating`: `{4.6, 12}` → true. `{null, 0}` → false. `{7, 3}` → false. `{4, 1.5}` → false. `{undefined, undefined}` → false.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- shop-art`. Expected: FAIL because the modules are missing.
- [ ] **Step 3: Implement both modules.** `findCustomerArea` uses `Array.prototype.find` on `id`, not object indexing.
- [ ] **Step 4: Add the `customer` message group** in Thai and English. `messages.test.ts` enforces key parity, so run it.
- [ ] **Step 5: Run** `npm run test --workspace @smartpos/web -- shop-art messages`. Expected: PASS.
- [ ] **Step 6: Checkpoint** `git status --short`.

---

### Task 2: Shared customer header, layout and `/areas` routes

**Files:**

- Create: `apps/web/src/features/storefront/CustomerHeader.tsx`, `CustomerHeader.test.tsx`, `customer.css`
- Modify: `apps/web/src/layouts/StorefrontLayout.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/route-pages.tsx`, `apps/web/src/app/routes.ts`
- Test: also update `ShopDirectory.test.tsx` and `StorefrontPage.test.tsx` where they assert the old header.

**Interfaces:**

- Consumes: the `storefront.customer.nav*` keys from Task 1.
- Produces:
  - `paths.areas = '/areas'`
  - `CustomerHeader({ slug?: string; tableQuery: string; cartCount: number }): JSX.Element`
  - `AreasPage` and `AreaDetailPage` lazy exports in `route-pages.tsx`. Task 4 implements them. Until then, the module exports stubs that render `null`.
  - The router has a pathless `{ element: <StorefrontLayout/> }` route with two children: the existing `paths.shop` child tree, and `{ path: '/areas', element: <AreasPage/> }` plus `{ path: '/areas/:areaId', element: <AreaDetailPage/> }`.
  - `StorefrontLayout` reads `slug` through `useParams()`. Under `/areas` it is `undefined`.

- [ ] **Step 1: Write failing tests** in `CustomerHeader.test.tsx`. Mock `useAuth` the way `LandingPage.test.tsx` does, and render inside a `MemoryRouter`:
  - The navigation landmark labelled `shell.customerStorefrontNavigation` contains links named หน้าแรก → `/`, สำรวจร้าน → `/shop`, พื้นที่ → `/areas`, หมวดหมู่อาหาร → `/#landing-categories`, สำหรับร้านค้า → `/#for-merchants`.
  - Anonymous: a "เข้าสู่ระบบ" link → `/login`. Authenticated: a "ไปที่พื้นที่ทำงาน" link → `/workspace`. Loading: a disabled button.
  - Without `slug`, there is no cart link. With `slug="noodle"`, `tableQuery="?table=T1"` and `cartCount=2`, the cart link `href` is `/shop/noodle/cart?table=T1` and its accessible name contains 2. **(Review Focus 3)**
  - With `slug` and `tableQuery`, the brand link `href` is `/shop/noodle?table=T1`.
  - The mobile disclosure `summary` is labelled "เมนู", and `aria-expanded` toggles.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- CustomerHeader`. Expected: FAIL.
- [ ] **Step 3: Implement `CustomerHeader`.** Reuse the landing navigation's structure (a desktop nav plus a `<details>` mobile menu), the `Brand` component and `LanguageSwitcher`. Mark the current link with `aria-current="page"` based on `useLocation().pathname`.
- [ ] **Step 4: Wire the layout and routes.** `StorefrontLayout` renders `CustomerHeader`, keeps its "All stores" back link only under `/shop/:slug`, and imports `customer.css`. Add `paths.areas` and the routes. In `route-pages.tsx`, point `AreasPage` and `AreaDetailPage` at `../features/storefront/AreasPage`. Create that module now with exports that return `null`.
- [ ] **Step 5: Update the old assertions.** In `ShopDirectory.test.tsx` and `StorefrontPage.test.tsx`, update only the assertions about the header, such as "the search is not inside `header`" and the shell class names. Keep every behavior assertion.
- [ ] **Step 6: Run** `npm run test --workspace @smartpos/web -- CustomerHeader ShopDirectory StorefrontPage workspace-routes`. Expected: PASS.
- [ ] **Step 7: Checkpoint.**

---

### Task 3: Screen 2, restaurant discovery (`/shop`)

**Files:**

- Create: `apps/web/src/features/storefront/ShopCard.tsx`, `ShopDirectoryGrid.tsx`, `ShopDirectoryGrid.test.tsx`
- Modify: `apps/web/src/features/storefront/StorefrontPage.tsx` (`ShopEntry`), `customer.css`, `ShopDirectory.test.tsx`
- Delete: the CSS for `.shop-directory-hero`, `.shop-directory-card` and `.shop-directory-view`, once nothing references it (check with Grep). Delete `/images/shop-directory.svg` only if nothing references it any longer.

**Interfaces:**

- Consumes: `shopCoverImage`, `hasValidRating`, `useShopDirectory`, `useShopFavorites(':directory')`, `businessTypeLabel` and `normalizeBusinessType`.
- Produces:
  - `ShopCard({ shop: ShopDirectoryEntry; favorite: boolean; onToggleFavorite(): void; action?: 'store' | 'cart' }): JSX.Element`. The card title links to `/shop/:slug`. When `action='cart'`, it adds a "ดูตะกร้า" link to `/shop/:slug/cart`.
  - `ShopDirectoryGrid({ shops: ShopDirectoryEntry[]; initialQuery?: string; initialType?: string | null; action?: 'store' | 'cart'; headingId: string }): JSX.Element`. It owns the search, chips, sort and type state.
  - Sort values: `recommended` (the default: open first, then input order), `open` (open only), `name` (`localeCompare` in the current language).
  - Chip values: `all`, `open`, `favorites`.

- [ ] **Step 1: Write failing tests** in `ShopDirectoryGrid.test.tsx`, with fixture shops including closed, cafe and no-rating cases:
  - The search box "ค้นหาร้าน" filters by name, ignoring case and surrounding spaces, and shows "ไม่พบร้านที่ตรงกับคำค้น" when nothing matches. This is the existing behavior.
  - The "เปิดอยู่" chip hides closed shops. The "ร้านโปรด" chip shows only favorited shops after you click a card's heart, and shows the empty message otherwise.
  - The sort select "เรียงตาม" with `name` orders the headings alphabetically.
  - The business-type group lists only the types present and filters by them. `initialType='CAFE'` starts filtered.
  - Each card has an image with `alt=""`, a status text (กำลังรับออเดอร์ or ปิดรับออเดอร์, not color alone), and a heart button with `aria-pressed`.
  - **(Review Focus 4)** `{average_rating: 4.6, review_count: 12}` shows `4.6`. `{null, 0}` shows "ยังไม่มีรีวิว". Missing fields show neither. `{7, 3}` shows no rating.
  - `action='cart'` renders a "ดูตะกร้า" link to `/shop/yam/cart`.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- ShopDirectoryGrid`. Expected: FAIL.
- [ ] **Step 3: Implement `ShopCard` and `ShopDirectoryGrid`** with the screen-2 layout: the type sidebar is on the left at 1024px and wider, and becomes a horizontal scroll row below that. The grid has 2 columns from 640px, and 3 columns from 1024px.
- [ ] **Step 4: Rewrite `ShopEntry`** as a page title "สำรวจร้านอาหาร" (the cart title when `?view=cart`), plus `ShopDirectoryGrid` with `initialQuery` from `?q=` and `initialType` from `?type=`. Keep the loading, error and empty-directory states exactly as they are.
- [ ] **Step 5: Update `ShopDirectory.test.tsx`** for the new toolbar structure. Keep the `?q=` / `?type=` and `?view=cart` behavior tests.
- [ ] **Step 6: Run** `npm run test --workspace @smartpos/web -- ShopDirectory StorefrontPage`. Expected: PASS.
- [ ] **Step 7: Checkpoint.**

---

### Task 4: Screens 3 and 4, areas and area detail

**Files:**

- Modify: `apps/web/src/features/storefront/AreasPage.tsx` (replace the stubs), `customer.css`
- Create: `apps/web/src/features/storefront/AreasPage.test.tsx`

**Interfaces:**

- Consumes: `customerAreas`, `findCustomerArea`, `ShopDirectoryGrid`, `useShopDirectory` and `paths.areas`.
- Produces: `AreasPage(): JSX.Element` and `AreaDetailPage(): JSX.Element` (reads `areaId` from `useParams`).
- Message keys: `customer.areasTitle` (พื้นที่และชุมชน), `customer.areasSearch`, `customer.areasEmpty`, `customer.areaBack`, `customer.areaUnmatchedNote` (ยังไม่สามารถจับคู่ร้านกับพื้นที่ได้ จึงแสดงร้านทั้งหมด), `customer.areaListed` (แสดง {count} ร้าน), `customer.areaNotFound`.

- [ ] **Step 1: Write failing tests:**
  - `/areas` shows the h1 "พื้นที่และชุมชน" and 4 links to `/areas/campus`, `/areas/market`, `/areas/dorm` and `/areas/community`, each with its banner image (`alt=""`) and its name.
  - Typing "ตลาด" in the area search leaves only the market card. Typing "zzz" shows `customer.areasEmpty`.
  - `/areas/campus` shows the h1 "มศว องครักษ์", a back link to `/areas`, the `areaUnmatchedNote` text, the shop cards from the mocked directory, and "แสดง 2 ร้าน" for 2 shops. No other text matches `/ร้านในพื้นที่/`.
  - **(Review Focus 1)** `/areas/unknown` and `/areas/%3Cscript%3E` show `customer.areaNotFound` with a link to `/areas`. The document contains no `<script>` text from the URL.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- AreasPage`. Expected: FAIL.
- [ ] **Step 3: Implement both pages.** The area search filters `t(title)` and `t(description)`, ignoring case. The detail hero uses the area banner image with a dark gradient so the text has at least 4.5:1 contrast.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

---

### Task 5: Screens 5 and 6, storefront and menu-detail dialog

**Files:**

- Create: `apps/web/src/features/storefront/MenuItemDialog.tsx`, `MenuItemDialog.test.tsx`, `use-product-quantity.ts`
- Modify: `apps/web/src/features/storefront/ShopCatalog.tsx`, `catalog.css` (remove the sidebar and hero rules this task replaces), `customer.css`, `StorefrontPage.test.tsx`

**Interfaces:**

- Consumes: `shopCoverImage`, `hasValidRating`, `useShopDirectory` (the cached directory entry for the rating and business type, matched by slug, with no extra request when cached), and `useShopCart`.
- Produces:
  - `useProductQuantity(product: ShopProduct, cartQuantity: string)` returns `{ quantity, setQuantity, units, step, whole, remaining, valid, ready, menuOnly, stock }`. This moves the existing calculation in `CatalogProductCard`, lines 559–585, unchanged. Both the card and the dialog use it.
  - `MenuItemDialog({ product: ShopProduct | null; cartQuantity: string; disabled: boolean; onAdd(quantity: string): void; onClose(): void }): JSX.Element`. It uses a native `<dialog>` with `showModal()` when `product` is not null.
  - In `ShopCatalog`: `const [selected, setSelected] = useState<ShopProduct | null>(null)`. Each card keeps its stepper and its "เพิ่มลงตะกร้า" button, so `shop-customer-ui.spec.ts:105-116` stays valid. It also gains a sibling "ดูรายละเอียด {name}" button (not a wrapper around the card) that opens the dialog. When the dialog closes, focus returns to that button.
  - Tabs: `role="tablist"` with "เมนูอาหาร", "ข้อมูลร้าน" and "รีวิว". Arrow keys move between tabs. Each panel has `role="tabpanel"`. The default tab is Menu.
- Message keys: `customer.storeMenuTab`, `storeInfoTab`, `storeReviewsTab`, `storePhone`, `storePickup`, `storeDelivery`, `storeShippingFee`, `storeNoReviews`, `storeRatingSummary`, `menuDetails`, `menuClose`, `menuAdd`.

- [ ] **Step 1: Write failing tests** in `MenuItemDialog.test.tsx` (stub `HTMLDialogElement.prototype.showModal` and `close` as `WorkspacePages.test.tsx` does) and in `StorefrontPage.test.tsx`:
  - Clicking "ดูรายละเอียด ข้าวผัด" opens a dialog named after the product. It shows the price `฿`, the variant, the category and a quantity stepper. Add to cart calls `cart.add`, and the existing live status says it was added.
  - Escape and the close button close the dialog, and focus returns to the opening button.
  - **(Review Focus 2)** A product with `available: '1.000'`, unit type `COUNT` and the cart already holding `1.000` has the dialog's Add button disabled, and the dialog shows `storefront.allAvailableQuantityIsAlreadyInYour`.
  - A sold-out product shows `storefront.soldOut`, and Add is disabled.
  - The store hero shows h1 = store name and the open-status text. The cover image is `/images/customer/cover-restaurant.webp` for a RESTAURANT directory entry. The rating shows only under the `hasValidRating` rule.
  - The "ข้อมูลร้าน" tab shows the description, phone and pickup instructions. The delivery fee shows only when `delivery_enabled`. The "รีวิว" tab shows either the aggregate or "ยังไม่มีรีวิว", and never review text.
  - The existing tests still pass: dine-in hero with `?table=`, category filter, search, sort, pagination and floating cart.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- MenuItemDialog StorefrontPage`. Expected: FAIL.
- [ ] **Step 3: Extract `useProductQuantity`** and switch `CatalogProductCard` to it. Re-run the existing `StorefrontPage` tests: they pass, so the extraction changed no behavior.
- [ ] **Step 4: Implement `MenuItemDialog`, the hero and the tabs.** The category sidebar becomes a horizontal chip row (`aria-pressed`) above the grid, and its `toggle-catalog-sidebar` listener and menu button are removed. The store logo is a round badge with the `Store` icon. There is no stand-in food photo for products without `image_url`.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Checkpoint.**

---

### Task 6: Screen 7, cart and checkout

**Files:**

- Modify: `apps/web/src/features/storefront/ShopCartPage.tsx`, `customer.css`, `ShopCartPage.test.tsx`

**Interfaces:**

- Consumes: the existing state in `ShopCartPage` (`diningType`, `selectDining`, `tableToken`, `shop.data.delivery_enabled`, `busy`). There are no new props.
- Produces: none. This is a visual-only change.
- Message keys: `customer.cartTitle` (ตะกร้าของคุณ), `fulfillmentTitle` (วิธีรับอาหาร), `fulfillmentPickup` (รับที่ร้าน), `fulfillmentDineIn` (ทานที่ร้าน), `fulfillmentDelivery` (จัดส่ง), `fulfillmentDineInHint` (สแกน QR ที่โต๊ะเพื่อเลือก), `cartTotal` (ยอดรวมทั้งหมด), `addMore` (+ เพิ่มเมนูจากร้านนี้).

- [ ] **Step 1: Write failing tests** in `ShopCartPage.test.tsx`:
  - The page h1 is "ตะกร้าของคุณ", and the store name is shown.
  - The fulfillment group "วิธีรับอาหาร" is a set of `aria-pressed` buttons with an icon and a text label. Without a table token, Pickup is pressed by default, and Dine-in is disabled with the `fulfillmentDineInHint` description through `aria-describedby`. With `?table=T`, Dine-in is pressed and Pickup is disabled. This keeps the existing `mode === 'takeaway' && !!tableToken` rule. Delivery shows only when `delivery_enabled` and no table token.
  - The line items show a thumbnail (`image_url` or a placeholder), the name, a stepper and a delete button with their existing labels.
  - The "+ เพิ่มเมนูจากร้านนี้" link goes to the store and keeps `?table=`.
  - All existing quote, checkout and pending-order tests still pass.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- ShopCartPage shop-cart guest-draft DineInMerge`. Expected: FAIL only on the new assertions.
- [ ] **Step 3: Replace the inline `style={…}` objects in the cart and summary sections with `customer.css` classes,** and restructure the JSX to the screen-7 layout: two columns from 960px, and stacked below that. Do not change any handler, effect, query or validation.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

---

### Task 7: Screens 8 and 9, tracking and payment

**Files:**

- Modify: `apps/web/src/features/storefront/ShopTrackingPage.tsx`, `OrderDetails.tsx`, `customer.css`, `ShopTrackingPage.test.tsx`, `DineInMerge.test.tsx` (only where it asserts the old stepper markup)
- Create: `tests/e2e/customer-reference.spec.ts`

**Interfaces:**

- Consumes: `OnlineOrder.events`, `status`, `payment_status`, `items`, `estimated_total` and `number`. The existing payment mutation and state stay as they are.
- Produces:
  - `OrderDetails` gains `variant?: 'customer' | 'staff'` (default `'staff'`, so `OnlineOrderPages` and `OnlineOrderPOS` are unchanged). The customer variant renders the order card and the vertical timeline.
  - The timeline is an `<ol aria-label="สถานะคำสั่งซื้อ">` with the steps `PENDING` (ได้รับคำสั่งซื้อ) → `PREPARING` → `READY` → `COMPLETED`. Each step's time is the `created_at` of the first event with that status, formatted with `formatDateTime`. The current step has `aria-current="step"`, finished steps carry the visible text "เสร็จแล้ว", and future steps carry the visible text "รอดำเนินการ" and show no time. For `REJECTED`, `CANCELLED` or `EXPIRED`, the timeline stops at the last reached step and adds a final step with that status label.
  - The order card thumbnail is a neutral icon badge (`UtensilsCrossed`). Orders have no image field, so there is no photo.
  - Page structure: h1, the privacy notice, then, only for an unpaid `PENDING` order, a payment row (test-mode payment card on the left, order summary on the right), then the order card with the timeline, then the review and refresh actions.
- Message keys: `customer.trackingTitle` (คำสั่งซื้อของฉัน), `trackingOrderNumber` (เลขที่คำสั่งซื้อ {number}), `trackingItems` ({count} รายการ), `trackingStepDone` (เสร็จแล้ว), `trackingStepPending` (รอดำเนินการ), `paymentTitle` (ชำระเงิน), `paymentTestMode` (โหมดทดสอบ), `paymentTestModeNote` (ระบบนี้ใช้การชำระเงินทดสอบ ยังไม่ใช่ PromptPay จริง), `paymentSummary` (รายละเอียดคำสั่งซื้อ), `paymentAmount` (ยอดชำระเงิน).

- [ ] **Step 1: Write failing tests** in `ShopTrackingPage.test.tsx`:
  - The h1 is "คำสั่งซื้อของฉัน". The order card shows the store name, the order number, "2 รายการ" for 2 lines, and the total.
  - With events PENDING at 10:24 and PREPARING at 10:26, the timeline has 4 items. PENDING shows its time and "เสร็จแล้ว". PREPARING has `aria-current="step"` and its time. READY and COMPLETED show "รอดำเนินการ" and no time.
  - For an unpaid PENDING order, the payment region comes before the order card in document order. For a PREPARING order, there is no payment region.
  - A CANCELLED order shows a final step labelled with the cancelled status text.
  - For an unpaid PENDING order, the payment region "ชำระเงิน" shows the "โหมดทดสอบ" badge text and the test-mode note, plus the 3 existing buttons. The page has no `img` whose name matches `/QR|PromptPay/i`, and no text matches `/ตรวจสอบอัตโนมัติ|verified automatically/i`.
  - The privacy notice, review panel (COMPLETED and eligible) and refresh button are still present. The existing `payment_return` and Stripe-link validation tests still pass.
- [ ] **Step 2: Run** `npm run test --workspace @smartpos/web -- ShopTrackingPage DineInMerge OnlineOrderPages`. Expected: FAIL only on the new assertions.
- [ ] **Step 3: Implement the customer variant and the payment layout.** Use 2 columns (payment card and order summary) from 960px, stacked below that.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Write `customer-reference.spec.ts`.** Route the `/api/v1/storefronts*` responses with `page.route`, using synthetic data the way `shop-customer-ui.spec.ts` does. For each width in [320, 390, 768, 1440], check `/shop`, `/areas`, `/areas/campus`, `/shop/ui-test`, `/shop/ui-test/cart` and `/shop/ui-test/orders/o1#access=<64 hex>`:
  - `document.documentElement.scrollWidth <= window.innerWidth`.
  - The header navigation is visible on desktop, or its menu summary is visible on mobile.
  - **(Review Focus 5)** At 320px on the tracking page, "เริ่มชำระเงิน" is in view after `scrollIntoViewIfNeeded()`, and its bounding box is inside the viewport width.
  - The dialog opens from a product card on `/shop/ui-test`, and Escape closes it.
- [ ] **Step 6: Checkpoint.**

---

### Task 8: Full verification, browser evidence and cleanup

**Files:**

- Modify: `tests/e2e/shop-directory.spec.ts` and `shop-customer-ui.spec.ts`, only for selectors whose markup intentionally changed. Do not remove any layout assertion without a replacement.
- Modify: `TODO.md` (remove this task's section when everything passes)

- [ ] **Step 1: Format** with `npx prettier --check apps/web tests/e2e docs/superpowers`. Expected: exit 0. If it fails, run `npx prettier --write` on the files this plan touched only, then re-check.
- [ ] **Step 2: Lint, typecheck, unit tests and build:** `npm run lint`, `npm run typecheck --workspace @smartpos/web`, `npm run test --workspace @smartpos/web`, `npm run build --workspace @smartpos/web`. Expected: each exits 0.
- [ ] **Step 3: Playwright.** Run `npx playwright test tests/e2e/customer-reference.spec.ts tests/e2e/shop-directory.spec.ts tests/e2e/shop-customer-ui.spec.ts tests/e2e/legacy-tracking-bookmark.spec.ts tests/e2e/landing.spec.ts`. Expected: all pass. If the web server cannot start in this environment, record that as an environment limitation, not as a pass.
- [ ] **Step 4: Rendered screenshots.** Take screenshots at 1440 and 390 of the 6 pages in Task 7, plus `/`. Compare them with the reference board, and confirm that `/` matches its pre-change screenshot.
- [ ] **Step 5: Review the diff.** Run `git diff --stat` and `git status --short`. Confirm there are no edits to the landing files, no `.env` changes and no stray files, and that only the planned files are listed.
- [ ] **Step 6: Clean up.** Remove this task's `TODO.md` section. Remove any temporary scripts or screenshots the agent created outside `tests/`.
