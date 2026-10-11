import { expect, it } from 'vitest';
import { safeReturnTo } from './AuthPages';

it('keeps an explicitly requested account destination', () => {
  expect(safeReturnTo('/account')).toBe('/account');
});

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
    expect(safeReturnTo(destination)).toBe('/workspace');
  },
);
