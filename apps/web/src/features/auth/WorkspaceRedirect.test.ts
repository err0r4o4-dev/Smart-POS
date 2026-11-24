import { expect, it } from 'vitest';
import { safeReturnTo } from './AuthPages';

it.each([
  null,
  '',
  '/account',
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

it('returns to setup after signing in from verification', () => {
  expect(safeReturnTo('/setup')).toBe('/setup');
});

it('allows the exact account security destination after signing in again', () => {
  expect(safeReturnTo('/security')).toBe('/security');
  expect(safeReturnTo('/security?next=//example.test')).toBe('/workspace');
});
