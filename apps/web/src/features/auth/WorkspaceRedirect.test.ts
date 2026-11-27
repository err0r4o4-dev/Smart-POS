import { expect, it } from 'vitest';
import { safeReturnTo } from './auth-destination';

it.each([
  null,
  '',
  '/dashboard',
  '/staff',
  '/manage/dashboard',
  '/work/products',
  '//example.test',
  'https://example.test',
  '/dashboard?role=OWNER',
])(
  'resolves the server-provided role instead of trusting returnTo=%s',
  (destination) => {
    expect(safeReturnTo(destination)).toBe('/');
  },
);

it('returns to setup after signing in from verification', () => {
  expect(safeReturnTo('/setup')).toBe('/setup');
});

it('allows the exact account security destination after signing in again', () => {
  expect(safeReturnTo('/security')).toBe('/security');
  expect(safeReturnTo('/security?next=//example.test')).toBe('/');
});

it('retains cart options without putting table or tracking credentials in login URLs', () => {
  expect(
    safeReturnTo(
      '/shop/bistro/cart?fulfillment=PICKUP&table=private#access=private',
    ),
  ).toBe('/shop/bistro/cart?fulfillment=PICKUP');
  expect(safeReturnTo('/shop/bistro/orders/123#access=private')).toBe('/');
});

it('keeps the directory page and all selected public filters', () => {
  const directory = '/shop?q=noodles&filter=open&filter=delivery&page=2';
  expect(safeReturnTo(directory)).toBe(directory);
});
