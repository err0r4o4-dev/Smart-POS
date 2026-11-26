import type { ShopDirectoryEntry } from '../../lib/storefront-api';

const art = '/images/customer';

/** Illustrative cover by normalized business type; never a real store photo. */
export function shopCoverImage(type: string) {
  if (type === 'CAFE' || type === 'BAR') return `${art}/cover-cafe.webp`;
  if (type === 'FAST_FOOD') return `${art}/cover-fast-food.webp`;
  if (type === 'BAKERY') return `${art}/cover-bakery.webp`;
  return `${art}/cover-restaurant.webp`;
}

/** Only show ratings the API reports as a real 1-5 average over reviews. */
export function hasValidRating(
  entry: Pick<ShopDirectoryEntry, 'average_rating' | 'review_count'>,
): entry is { average_rating: number; review_count: number } {
  const { average_rating: average, review_count: count } = entry;
  return (
    typeof average === 'number' &&
    average >= 1 &&
    average <= 5 &&
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count > 0
  );
}
