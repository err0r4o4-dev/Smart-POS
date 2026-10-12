import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { CheckoutPage } from './CheckoutPage';

const mocks = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn() }));
vi.mock('./POSContext', () => ({
  usePOS: () => ({
    user: 'user',
    org: 'org',
    branch: 'branch',
    terminal: { id: 'terminal' },
    shift: { id: 'shift' },
    busy: false,
    cart: {
      id: 'cart',
      revision: 2,
      total: '10.00',
      items: [{ variant_id: 'variant' }],
    },
    mutate: mocks.mutate,
    can: () => true,
  }),
}));
vi.mock('../../lib/pos-api', async (original) => ({
  ...(await original<typeof import('../../lib/pos-api')>()),
  posRequest: mocks.request,
}));
vi.mock('../pricing/PricingCheckoutControls', () => ({
  PricingCheckoutControls: () => null,
}));
vi.mock('../loyalty/LoyaltyCheckoutControls', () => ({
  LoyaltyCheckoutControls: () => null,
}));

it('keeps cash input and blocks a new checkout until pending server state can be loaded', async () => {
  mocks.request
    .mockRejectedValueOnce(new Error('โหลดสถานะรายการไม่สำเร็จ'))
    .mockResolvedValue({ items: [], total: 0 });
  mocks.mutate.mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const prepare = screen.getByRole('button', {
    name: 'ตรวจสอบยอดและเตรียมชำระเงิน',
  });
  expect(prepare).toBeDisabled();
  fireEvent.change(screen.getByLabelText('เงินรับ'), {
    target: { value: '10.00' },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดสถานะรายการไม่สำเร็จ',
  );
  expect(prepare).toBeDisabled();
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' }),
  );
  await waitFor(() => expect(prepare).toBeEnabled());
  expect(screen.getByLabelText('เงินรับ')).toHaveValue('10.00');
  fireEvent.click(prepare);
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith(
      '/pos/checkout',
      expect.objectContaining({
        cart_id: 'cart',
        revision: 2,
        method: 'CASH',
        received: '10.00',
        expected_total: '10.00',
      }),
      'POST',
      expect.any(String),
    ),
  );
});
