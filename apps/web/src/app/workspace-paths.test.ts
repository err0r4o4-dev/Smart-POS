import { expect, it } from 'vitest';
import {
  businessArea,
  isBusinessPath,
  workspacePath,
} from './workspace-paths';

it.each([
  '/dashboard',
  '/pos',
  '/pos/checkout',
  '/pos/shifts/open',
  '/orders',
  '/orders/ord-1',
  '/kitchen',
  '/menu',
  '/menu/new',
  '/menu/categories',
  '/menu/units',
  '/sales',
  '/sales/sale-1',
  '/receipts',
  '/refunds',
  '/refunds/REF-01',
  '/settings',
  '/settings/storefront',
  '/settings/payments',
])('recognizes clean restaurant business path %s as management', (path) => {
  expect(isBusinessPath(path)).toBe(true);
  expect(businessArea(path)).toBe('management');
});

it.each([
  '/manage',
  '/manage/pos',
  '/manage/dashboard',
  '/work/products',
  '/products',
  '/online-orders',
  '/restaurant/queue',
  '/employees',
  '/employees/one',
  '/roles',
  '/roles/one',
  '/shop',
  '/shop/a/cart',
  '/shop/a/orders/ord-1',
  '/account',
  '/setup',
  '/help',
  '/menu-other',
  '//example.test/menu',
])('does not treat neutral, public, or retired path %s as business area', (path) => {
  expect(isBusinessPath(path)).toBe(false);
  expect(businessArea(path)).toBeUndefined();
});

it.each(['/menu/item?search=abc#details', '/kitchen', '/pos', '/shop', '/settings'])(
  'keeps clean root path %s without legacy /manage prefix',
  (path) => {
    expect(workspacePath(path, 'management')).toBe(path);
    expect(workspacePath(path)).toBe(path);
  },
);
