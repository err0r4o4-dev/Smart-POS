import { describe, expect, it } from 'vitest';
import { customerAreas, findCustomerArea } from './customer-areas';
import { hasValidRating, shopCoverImage } from './shop-art';

describe('customer areas', () => {
  it('lists the four approved areas in display order', () => {
    expect(customerAreas.map((area) => area.id)).toEqual([
      'campus',
      'market',
      'dorm',
      'community',
    ]);
  });

  it('finds an area by id and its generated banner', () => {
    expect(findCustomerArea('campus')?.image).toBe(
      '/images/customer/area-campus.webp',
    );
    expect(findCustomerArea('campus')?.title).toBe('landing.areaCampus');
  });

  it.each([undefined, '', 'nope', '__proto__', 'constructor', '<script>'])(
    'returns nothing for the unknown area id %s',
    (id) => {
      expect(findCustomerArea(id)).toBeUndefined();
    },
  );
});

describe('shop cover image', () => {
  it.each([
    ['CAFE', 'cover-cafe.webp'],
    ['BAR', 'cover-cafe.webp'],
    ['FAST_FOOD', 'cover-fast-food.webp'],
    ['BAKERY', 'cover-bakery.webp'],
    ['RESTAURANT', 'cover-restaurant.webp'],
    ['RETAIL', 'cover-restaurant.webp'],
    ['', 'cover-restaurant.webp'],
  ])('maps %s to %s', (type, file) => {
    expect(shopCoverImage(type)).toBe(`/images/customer/${file}`);
  });
});

describe('valid rating', () => {
  it('accepts an in-range average with a positive whole review count', () => {
    expect(hasValidRating({ average_rating: 4.6, review_count: 12 })).toBe(
      true,
    );
    expect(hasValidRating({ average_rating: 1, review_count: 1 })).toBe(true);
    expect(hasValidRating({ average_rating: 5, review_count: 1 })).toBe(true);
  });

  it.each([
    [null, 0],
    [7, 3],
    [0.5, 3],
    [4, 1.5],
    [4, 0],
    [Number.NaN, 2],
    [undefined, undefined],
  ])('rejects average %s with %s reviews', (average, count) => {
    expect(
      hasValidRating({
        average_rating: average as number | null | undefined,
        review_count: count as number | undefined,
      }),
    ).toBe(false);
  });
});
