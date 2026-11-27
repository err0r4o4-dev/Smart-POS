# Market Pilot storefront details

## Customer outcome

All 13 published Market Pilot stores have a real category in Explore and show their regular opening hours and weekly closing day in the storefront Information tab, in Thai and English. Use the approved catalog's merchant-provided profile values, not inferred hours or generic category labels. Example: ครัวป้าพริก shows อาหารตามสั่ง, 10:00–20:30 (เวลาไทย), and หยุดวันจันทร์. This is informational, not a live open/closed calculation.

## Approach

The selected approach extends the synchronized category allowlist in PostgreSQL, Go, the public contract, and the existing web filter. Add `southern-thai`, `northern-thai`, `seafood`, `breakfast`, and `asian` for the five currently uncategorized shops. Preserve the eight existing choices and the existing per-store selection limit. Do not add a global nonempty database constraint: that would change other stores, legacy settings, and onboarding. Guarantee nonempty categories for the exact 13-store pilot via scoped backfill and acceptance checks. Display recognized storefront category labels on the shop information panel and preserve existing card/filter behavior. The rejected text-only alternative would not make the new categories filterable.

Persist optional `opening_hours` on storefront settings, validated in Go and PostgreSQL: `{opens: "HH:MM", closes: "HH:MM", closed_weekday: 0..6, timezone: "Asia/Bangkok"}`; weekday numbering is Sunday=0. This deliberately describes the catalog's single same-day interval and one weekly holiday; it does not claim support for overnight intervals, holidays by date, or multiple daily windows. Separate it from the restaurant availability/order admission model: none of these 13 storefronts has a restaurant profile, and creating one just to display hours is out of scope. An omitted input preserves existing hours; omitted output means not configured. Preserve old clients and all non-pilot records.

## Data and rollout boundaries

Use the existing audited, MFA-protected revision-checked owner storefront API for a dedicated metadata-only update of the exact 13 published pilot slugs. The owner runner must preserve storefront visibility, closed ordering, fulfillment settings, covers, identity, and terminal associations; never change orders, permissions, catalog SKUs, reviews, or unrelated stores. Show the existing “no reviews” state; do not invent reviews. Track each operation privately and stop if the outcome is ambiguous. Do not reuse the original draft/publication script as-is. Verify on a disposable database before asking for retained migration/service rollout approval. Use a fresh private backup and independently reviewed change/rollback before the retained rollout; the pre-import archive is not a rollback plan for this update.
