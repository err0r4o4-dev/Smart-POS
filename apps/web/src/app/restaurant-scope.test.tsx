import { isValidElement } from 'react';
import {
  createMemoryRouter,
  matchRoutes,
  RouterProvider,
} from 'react-router-dom';
import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { render } from '../test/render';
import { navigation } from './routes';
import { router } from './router';
import { ManagementHomePage } from '../features/workspace/WorkspacePages';
import {
  SystemPage,
  RestaurantPage,
  OnlineOrdersPage,
  OnlineOrderPage,
  ShopCartPage,
  ShopTrackingPage,
  ProductsPage,
  ProductDetailsPage,
  ProductEditorPage,
  TaxonomyPage,
  SalesPage,
  SaleDetailsPage,
  ReturnsPage,
  POSTerminalPage,
  CheckoutPage,
  HeldCartsPage,
  POSRegisterPage,
  SettingsPage,
  StorefrontSettingsPage,
  PaymentSandboxPage,
} from './route-pages';

const retiredPaths = [
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
  '/restaurant/queue',
  '/restaurant/settings',
  '/restaurant/tables',
  '/online-orders',
  '/online-orders/ord-1',
  '/products',
  '/products/new',
  '/products/import',
  '/products/labels',
  '/categories',
  '/units',
  '/brands',
  '/loyalty',
  '/customers',
  '/customers/groups',
  '/pricing',
  '/promotions',
  '/discount-approvals',
  '/pos/exchanges',
  '/pos/returns',
  '/pos/register/open',
  '/pos/register/close',
  '/pos/register/history',
  '/sales/voids',
  '/sales/refunds',
  '/sales/refunds/REF-01',
  '/settings/store',
  '/settings/branches',
  '/settings/storefront/payments',
  '/account',
  '/help/system',
];

it.each(['', '/manage', '/work'])(
  'routes retired or legacy path under prefix "%s" to 404 SystemPage',
  (prefix) => {
    for (const path of retiredPaths) {
      if (prefix === '/manage' && path === '/settings/storefront/payments') {
        continue;
      }
      const matches = matchRoutes(router.routes, prefix + path);
      const element = matches?.at(-1)?.route.element;
      expect(isValidElement(element), prefix + path).toBe(true);
      expect(isValidElement(element) && element.type, prefix + path).toBe(
        SystemPage,
      );
    }
  },
);

it.each([
  '/manage',
  '/manage/dashboard',
  '/manage/sales',
  '/manage/pos',
  '/work',
  '/work/pos',
  '/staff',
  '/employees',
  '/employees/a',
  '/manage/employees',
  '/roles',
  '/sales/voids',
  '/restaurant/recipes',
  '/inventory/batches',
])('renders 404 not found without API requests for %s', async (path) => {
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

it('exposes only clean root restaurant paths in sidebar navigation', () => {
  const links = navigation.map((item) => item.to);
  expect(links).toEqual([
    '/dashboard',
    '/pos',
    '/orders',
    '/kitchen',
    '/menu',
    '/sales',
    '/receipts',
    '/refunds',
    '/help',
  ]);
  expect(links.some((link) => link.startsWith('/manage'))).toBe(false);
});

it('maps canonical restaurant routes directly to their pages', () => {
  for (const [path, component] of [
    ['/dashboard', ManagementHomePage],
    ['/kitchen', RestaurantPage],
    ['/orders', OnlineOrdersPage],
    ['/orders/order-1', OnlineOrderPage],
    ['/menu', ProductsPage],
    ['/menu/new', ProductEditorPage],
    ['/menu/item-1', ProductDetailsPage],
    ['/menu/item-1/edit', ProductEditorPage],
    ['/menu/categories', TaxonomyPage],
    ['/menu/units', TaxonomyPage],
    ['/sales', SalesPage],
    ['/sales/sale-1', SaleDetailsPage],
    ['/receipts', SalesPage],
    ['/refunds', ReturnsPage],
    ['/refunds/REF-01', ReturnsPage],
    ['/pos', POSTerminalPage],
    ['/pos/checkout', CheckoutPage],
    ['/pos/held-carts', HeldCartsPage],
    ['/pos/shifts', POSRegisterPage],
    ['/pos/shifts/open', POSRegisterPage],
    ['/pos/shifts/close', POSRegisterPage],
    ['/pos/shifts/history', POSRegisterPage],
    ['/settings', SettingsPage],
    ['/settings/storefront', StorefrontSettingsPage],
    ['/settings/payments', PaymentSandboxPage],
  ] as const) {
    const element = matchRoutes(router.routes, path)?.at(-1)?.route.element;
    expect(isValidElement(element) && element.type, path).toBe(component);
  }
});

it('maps customer storefront cart and canonical order tracking routes', () => {
  for (const [path, component] of [
    ['/shop/restaurant-a/cart', ShopCartPage],
    ['/shop/restaurant-a/orders/order-a', ShopTrackingPage],
  ] as const) {
    const element = matchRoutes(router.routes, path)?.at(-1)?.route.element;
    expect(isValidElement(element) && element.type, path).toBe(component);
  }
});

it('redirects legacy customer Stripe return URL /shop/:slug/track/:orderId to /shop/:slug/orders/:orderId with query and hash intact', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const memoryRouter = createMemoryRouter(router.routes, {
    initialEntries: [
      '/shop/restaurant-a/track/order-a?payment_return=1#access=abc',
    ],
  });
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected API request in redirect test'));
  try {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={memoryRouter} />
      </QueryClientProvider>,
    );
    expect(memoryRouter.state.location.pathname).toBe(
      '/shop/restaurant-a/orders/order-a',
    );
    expect(memoryRouter.state.location.search).toBe('?payment_return=1');
    expect(memoryRouter.state.location.hash).toBe('#access=abc');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    memoryRouter.dispose();
    queryClient.clear();
    fetchSpy.mockRestore();
  }
});
