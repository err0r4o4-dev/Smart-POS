import { expect, it } from 'vitest';
import { businessArea, isBusinessPath, workspacePath } from './workspace-paths';

it('recognizes only the management workspace', () => {
  expect(businessArea('/manage/pos')).toBe('management');
  expect(businessArea('/work/products')).toBeUndefined();
  expect(businessArea('/manage-other')).toBeUndefined();
});

it.each(['/employees', '/employees/one', '/roles', '/roles/one'])(
  'does not scope retired path %s',
  (path) => {
    expect(isBusinessPath(path)).toBe(false);
    expect(workspacePath(path, 'management')).toBe(path);
  },
);

it.each(['/products/item?search=abc#details', '/restaurant/queue', '/pos'])(
  'scopes %s in management only',
  (path) => {
    expect(workspacePath(path, 'management')).toBe('/manage' + path);
    expect(workspacePath(path)).toBe(path);
  },
);

it.each([
  '/shop',
  '/shop/a/cart',
  '/account',
  '/manage/products',
  '/work/products',
  '/products-other',
  '//example.test/products',
])('preserves neutral or already scoped path %s', (path) => {
  expect(workspacePath(path, 'management')).toBe(path);
});
