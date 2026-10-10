import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { LoyaltyPage } from './LoyaltyPage';
const mocks = vi.hoisted(() => ({ manage: false, request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: { id: 'org' },
      permissions: mocks.manage
        ? ['loyalty.read', 'loyalty.manage']
        : ['loyalty.read'],
    },
    branchID: 'branch',
    can: (permission: string) => permission === 'loyalty.read' || mocks.manage,
  }),
}));
vi.mock('../../lib/loyalty-api', () => ({ loyaltyRequest: mocks.request }));
vi.mock('../../lib/customers-api', () => ({
  customerRequest: vi.fn().mockResolvedValue({ items: [] }),
}));
function show(history = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LoyaltyPage history={history} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mocks.manage = false;
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({ items: [] });
});
it('shows empty real-data state without management controls', async () => {
  show();
  expect(await screen.findByText('ไม่มีรายการ / No entries')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'บันทึก / Save' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'ปรับแต้ม / Adjust points' }),
  ).not.toBeInTheDocument();
});
it('shows balance derived by backend and transaction detail links', async () => {
  mocks.request.mockImplementation((_org: string, path: string) =>
    Promise.resolve({
      items: path.startsWith('/loyalty/accounts')
        ? [
            {
              id: 'account',
              customer_id: 'customer',
              customer_code: 'MEMBER',
              customer_name: 'Member',
              program_name: 'Rewards',
              status: 'ACTIVE',
              program_status: 'ACTIVE',
              balance: '-3',
              available: '0',
            },
          ]
        : [],
    }),
  );
  show();
  expect(await screen.findByText('MEMBER · Member')).toBeVisible();
  expect(screen.getByText('-3')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'ลูกค้า / Customer' }),
  ).toHaveAttribute('href', '/customers/customer');
});
it('offers a retry for API failure', async () => {
  mocks.request.mockRejectedValue(new Error('Loyalty unavailable'));
  show(true);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Loyalty unavailable',
  );
  mocks.request.mockResolvedValue({ items: [] });
  fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่ / Retry' }));
  expect(await screen.findByText('ไม่มีรายการ / No entries')).toBeVisible();
});
