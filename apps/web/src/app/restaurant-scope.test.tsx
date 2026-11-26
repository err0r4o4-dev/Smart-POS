import { isValidElement } from 'react';
import {
  createMemoryRouter,
  matchRoutes,
  RouterProvider,
} from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { render, renderInEnglish } from '../test/render';
import { navigation } from './routes';
import { AuthProvider } from './AuthProvider';
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
  ...['', '/manage', '/work'].flatMap((prefix) =>
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

it.each([true, false])(
  'checks storefront.manage before following the legacy payment link (allowed=%s)',
  async (allowed) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [
        '/manage/settings/storefront/payments?source=bookmark#details',
      ],
    });
    const visited: string[] = [];
    const unsubscribe = memoryRouter.subscribe((state) =>
      visited.push(state.location.pathname),
    );
    const org = { id: 'test-restaurant', name: 'Test restaurant' };
    const sandbox = `/organizations/${org.id}/storefront/payment-sandbox`;
    const responses: Record<string, unknown> = {
      '/auth/me': {
        user: {
          id: 'test-owner',
          display_name: 'Test Owner',
          email: 'owner@example.test',
          email_verified: true,
          status: 'ACTIVE',
        },
        csrf_token: 'synthetic-csrf',
      },
      '/organizations': [org],
      [`/organizations/${org.id}/context`]: {
        organization: org,
        membership: { role: 'OWNER', status: 'ACTIVE' },
        branches: [{ id: 'test-branch', name: 'Test branch' }],
        permissions: allowed ? ['storefront.manage'] : [],
      },
      [`/organizations/${org.id}/restaurant/setup`]: {
        completed: true,
        readiness: { ready: true, incomplete: [] },
        steps: [],
      },
      [sandbox]: {
        provider: 'stripe',
        mode: 'test',
        configured: false,
        amount_minor: 2000,
        currency: 'thb',
        customer_checkout_enabled: false,
      },
    };
    const calls: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const path = new URL(
          String(input),
          'http://localhost',
        ).pathname.replace(/^\/api\/v1/, '');
        calls.push(path);
        if (!Object.hasOwn(responses, path))
          throw new Error(`Unexpected request: ${path}`);
        return Response.json({ data: responses[path] });
      });
    const dialog = HTMLDialogElement.prototype;
    const close = Object.getOwnPropertyDescriptor(dialog, 'close');
    if (!close)
      Object.defineProperty(dialog, 'close', {
        configurable: true,
        value: vi.fn(),
      });
    try {
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={memoryRouter} />
          </AuthProvider>
        </QueryClientProvider>,
      );
      if (allowed) {
        await waitFor(() => expect(calls).toContain(sandbox));
        expect(memoryRouter.state.location).toMatchObject({
          pathname: '/settings/payments',
          search: '?source=bookmark',
          hash: '#details',
        });
        expect(memoryRouter.state.historyAction).toBe('REPLACE');
      } else {
        await waitFor(() =>
          expect(memoryRouter.state.location.pathname).toBe('/403'),
        );
        expect(visited).not.toContain('/settings/payments');
        expect(calls).not.toContain(sandbox);
      }
    } finally {
      unsubscribe();
      memoryRouter.dispose();
      queryClient.clear();
      fetchSpy.mockRestore();
      if (!close) Reflect.deleteProperty(dialog, 'close');
    }
  },
);

it('redirects a legacy tracking URL without treating its query as order proof', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const token = 'a'.repeat(64);
  const memoryRouter = createMemoryRouter(router.routes, {
    initialEntries: [
      `/shop/restaurant-a/track/order-a?source=bookmark&access=${token}`,
    ],
  });
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected API request in redirect test'));
  try {
    renderInEnglish(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={memoryRouter} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Incomplete tracking link/)).toBeTruthy();
    expect(memoryRouter.state.location.pathname).toBe(
      '/shop/restaurant-a/orders/order-a',
    );
    expect(memoryRouter.state.location.search).toBe(
      `?source=bookmark&access=${token}`,
    );
    expect(memoryRouter.state.location.hash).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    memoryRouter.dispose();
    queryClient.clear();
    fetchSpy.mockRestore();
  }
});

it('sends a legacy tracking fragment in the canonical order proof request only', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const token = 'b'.repeat(64);
  const memoryRouter = createMemoryRouter(router.routes, {
    initialEntries: [
      `/shop/restaurant-a/track/order-a?payment_return=1#access=${token}`,
    ],
  });
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      }),
      { status: 404 },
    ),
  );
  try {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={memoryRouter} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Order not found')).toBeTruthy();
    expect(memoryRouter.state.location).toMatchObject({
      pathname: '/shop/restaurant-a/orders/order-a',
      search: '?payment_return=1',
      hash: `#access=${token}`,
    });
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/storefronts/restaurant-a/track',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        body: JSON.stringify({ order_id: 'order-a', access_token: token }),
      }),
    );
  } finally {
    memoryRouter.dispose();
    queryClient.clear();
    fetchSpy.mockRestore();
  }
});
