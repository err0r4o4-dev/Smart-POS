import { expect, it } from 'vitest';
import {
  businessArea,
  isBusinessPath,
  isManagementPath,
  workspacePath,
} from './workspace-paths';

it.each([
  'products',
  'inventory',
  'pos',
  'sales',
  'purchasing/orders',
  'customers',
])('scopes %s without losing queries or fragments', (module) => {
  const path = `/${module}/item-1?search=abc#details`;
  expect(workspacePath(path, 'management')).toBe('/manage' + path);
  expect(workspacePath(path, 'staff')).toBe('/work' + path);
});

it('does not treat removed /shelves flow as a business workspace path', () => {
  expect(isBusinessPath('/shelves')).toBe(false);
  expect(isBusinessPath('/shelves/replenishments')).toBe(false);
  expect(workspacePath('/shelves', 'management')).toBe('/shelves');
  expect(workspacePath('/shelves', 'staff')).toBe('/shelves');
});

it.each([
  '/shop',
  '/account',
  '/help',
  '/login',
  '/workspace',
  '/setup',
  '//example.test/products',
  'https://example.test/products',
  '/products-other',
  '/manage/products',
  '/work/products',
])(
  'does not rewrite neutral, external or already scoped destination %s',
  (path) => {
    expect(workspacePath(path, 'staff')).toBe(path);
  },
);

it('uses segment boundaries and excludes management administration from work routes', () => {
  expect(businessArea('/work/products/item')).toBe('staff');
  expect(businessArea('/manage/pos')).toBe('management');
  expect(businessArea('/work-other')).toBeUndefined();
  expect(isBusinessPath('/products/item')).toBe(true);
  expect(isManagementPath('/settings/store')).toBe(true);
  expect(isManagementPath('/pricing/lists')).toBe(true);
  expect(isManagementPath('/products')).toBe(false);
  expect(workspacePath('/discount-approvals', 'staff')).toBe(
    '/manage/discount-approvals',
  );
});
