import { isValidElement } from 'react';
import { matchRoutes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { navigation, staffNavigation } from './routes';
import { router } from './router';
import {
  SystemPage,
  RestaurantPage,
  OnlineOrdersPage,
  QualityPage,
  ShopCartPage,
  ShopTrackingPage,
  ProductsPage,
  SalesPage,
  ReturnsPage,
} from './route-pages';

const removedPaths = [
  '/suppliers',
  '/purchasing/orders',
  '/purchasing/orders/new',
  '/shelves',
  '/inventory',
  '/inventory/balances',
  '/inventory/locations',
  '/inventory/movements',
  '/inventory/counts/count-a',
  '/inventory/transfers/transfer-a',
  '/inventory/reorder-points',
  '/loyalty',
  '/customers',
  '/customers/groups',
  '/pricing',
  '/promotions',
  '/discount-approvals',
  '/brands',
  '/products/import',
  '/products/labels',
  '/pos/exchanges',
  '/pos/returns',
  '/sales/voids',
];

it.each(['', '/manage', '/work'])(
  'does not route retired retail screens through a page or dynamic ID under %s',
  (prefix) => {
    for (const path of removedPaths) {
      const matches = matchRoutes(router.routes, prefix + path);
      const element = matches?.at(-1)?.route.element;
      expect(isValidElement(element), prefix + path).toBe(true);
      expect(isValidElement(element) && element.type, prefix + path).toBe(
        SystemPage,
      );
    }
  },
);

it('removes retail-only tools from both workspaces while retaining restaurant work', () => {
  const links = [...navigation, ...staffNavigation].map((item) => item.to);
  for (const prefix of ['/manage', '/work']) {
    for (const path of removedPaths) {
      expect(links, prefix + path).not.toContain(prefix + path);
    }
    expect(links).toContain(prefix + '/restaurant/queue');
    expect(links).toContain(prefix + '/online-orders');
    expect(links).toContain(prefix + '/sales');
    expect(links).toContain(prefix + '/sales/refunds');
  }
  expect(links).toContain('/manage/restaurant/recipes');
  expect(links).toContain('/manage/restaurant/tables');
  expect(links).toContain('/manage/restaurant/quick-stock');
  expect(links).not.toContain('/manage/restaurant/forecast');
});

it.each(['/manage', '/work'])(
  'keeps live restaurant and historical record routes under %s',
  (prefix) => {
    for (const [path, component] of [
      ['/restaurant/queue', RestaurantPage],
      ['/online-orders', OnlineOrdersPage],
      ['/inventory/batches', QualityPage],
      ['/inventory/write-offs', QualityPage],
      ['/products', ProductsPage],
      ['/sales', SalesPage],
      ['/sales/refunds', ReturnsPage],
    ] as const) {
      const element = matchRoutes(router.routes, prefix + path)?.at(-1)?.route
        .element;
      expect(isValidElement(element) && element.type, prefix + path).toBe(
        component,
      );
    }
  },
);

it('preserves customer online cart and tracking routes', () => {
  for (const [path, component] of [
    ['/shop/restaurant-a/cart', ShopCartPage],
    ['/shop/restaurant-a/track/order-a', ShopTrackingPage],
  ] as const) {
    const element = matchRoutes(router.routes, path)?.at(-1)?.route.element;
    expect(isValidElement(element) && element.type, path).toBe(component);
  }
});
