import { isValidElement } from 'react';
import {
  createMemoryRouter,
  matchRoutes,
  RouterProvider,
} from 'react-router-dom';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { render } from '../test/render';
import { navigation } from './routes';
import { router } from './router';
import {
  SystemPage,
  RestaurantPage,
  OnlineOrdersPage,
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
  '/inventory/batches',
  '/inventory/expiry',
  '/inventory/write-offs',
  '/inventory/recalls',
  '/restaurant/recipes',
  '/restaurant/recipes/old',
  '/restaurant/quick-stock',
  '/restaurant/forecast',
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

it.each(
  ['', '/manage', '/work'].flatMap((prefix) =>
    [
      '/restaurant/recipes',
      '/restaurant/quick-stock',
      '/restaurant/forecast',
      '/inventory/batches',
      '/inventory/expiry',
      '/inventory/write-offs',
      '/inventory/recalls',
    ].map((path) => prefix + path),
  ),
)('renders not found without requests for retired URL %s', async (path) => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [path],
    });
    render(<RouterProvider router={memoryRouter} />);
    expect(await screen.findByText('404 · NOT FOUND')).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    memoryRouter.dispose();
  } finally {
    fetchSpy.mockRestore();
  }
});

it('removes retail-only tools from both workspaces while retaining restaurant work', () => {
  const links = navigation.map((item) => item.to);
  for (const prefix of ['/manage']) {
    for (const path of removedPaths) {
      expect(links, prefix + path).not.toContain(prefix + path);
    }
    expect(links).toContain(prefix + '/restaurant/queue');
    expect(links).toContain(prefix + '/online-orders');
    expect(links).toContain(prefix + '/sales');
    expect(links).toContain(prefix + '/sales/refunds');
  }
  expect(links).not.toContain('/manage/restaurant/recipes');
  expect(links).not.toContain('/manage/restaurant/tables');
  expect(links).not.toContain('/manage/restaurant/quick-stock');
  expect(links).not.toContain('/manage/restaurant/forecast');
});

it.each(['/manage'])(
  'keeps live restaurant and historical record routes under %s',
  (prefix) => {
    for (const [path, component] of [
      ['/restaurant/queue', RestaurantPage],
      ['/online-orders', OnlineOrdersPage],
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

it.each([
  '/work',
  '/work/pos',
  '/work/restaurant/queue',
  '/staff',
  '/employees',
  '/employees/a',
  '/manage/employees',
  '/manage/employees/a',
  '/roles',
  '/manage/roles',
])('does not expose retired route %s', (path) => {
  const element = matchRoutes(router.routes, path)?.at(-1)?.route.element;
  expect(isValidElement(element) && element.type).toBe(SystemPage);
});
