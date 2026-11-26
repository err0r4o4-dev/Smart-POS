import { screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../../test/render';
import type { OnlineOrder } from '../../lib/storefront-api';
import { OrderDetails } from './OrderDetails';
import { ShopCatalog } from './ShopCatalog';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../lib/storefront-api', async (original) => ({
  ...(await original<typeof import('../../lib/storefront-api')>()),
  storefrontRequest: request,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  request.mockReset();
});

it('does not infer verified payment from fulfillment status', () => {
  const order: OnlineOrder = {
    stock_policy: 'MENU_ONLY',
    id: 'synthetic-order',
    number: 'WEB-TEST',
    status: 'READY',
    payment_status: 'UNPAID',
    store_name: 'Synthetic shop',
    store_phone: '',
    pickup_instructions: '',
    estimated_total: '10.00',
    final_total: null,
    receipt_number: null,
    revision: 1,
    created_at: '2026-11-12T00:00:00Z',
    expires_at: '2026-11-13T00:00:00Z',
    items: [],
    events: [],
  };
  renderInEnglish(<OrderDetails order={order} />);
  expect(screen.getByText('Awaiting payment')).toBeVisible();
  expect(screen.queryByText('Payment verified')).not.toBeInTheDocument();
});

it('preserves an invalid table query on the floating cart link', async () => {
  localStorage.setItem(
    'shop-cart:synthetic-shop',
    JSON.stringify([
      {
        variant_id: 'item',
        product_name: 'Synthetic item',
        variant_name: '',
        sku: 'A',
        unit: 'piece',
        unit_type: 'COUNT',
        unit_price: '10.00',
        quantity: '1.000',
      },
    ]),
  );
  sessionStorage.setItem('smartpos-table:synthetic-shop', 'a'.repeat(64));
  request.mockImplementation(async (path: string) =>
    path.includes('/products?')
      ? { items: [], total: 0, page: 1, page_size: 24, categories: [] }
      : { name: 'Synthetic shop', accepting_orders: true, published: true },
  );
  renderInEnglish(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/shop/synthetic-shop?table=invalid']}>
        <ShopCatalog slug="synthetic-shop" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const summary = await screen.findByRole('complementary', {
    name: 'สรุปตะกร้าสินค้า',
  });
  expect(within(summary).getByRole('link')).toHaveAttribute(
    'href',
    '/shop/synthetic-shop/cart?table=invalid',
  );
});
