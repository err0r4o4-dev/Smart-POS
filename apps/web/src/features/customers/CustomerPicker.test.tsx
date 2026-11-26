import { render } from '../../test/render';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerPicker } from './CustomerPicker';

vi.mock('../pos/POSContext', () => ({
  usePOS: () => ({
    org: 'org',
    user: 'user',
    branch: 'branch',
    can: () => true,
    busy: false,
    cart: { id: 'cart', revision: 1, customer_id: null, customer: null },
    mutate: vi.fn(),
  }),
}));
vi.mock('../../lib/customers-api', () => ({
  customerRequest: vi.fn(() =>
    Promise.resolve({ items: [], page: 1, page_size: 10, total: 0 }),
  ),
}));
describe('CustomerPicker privacy defaults', () => {
  it('keeps anonymous checkout and never requires contact information', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerPicker />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Walk-in/)).toBeInTheDocument();
    expect(screen.getByLabelText(/ค้นหาลูกค้า/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/อีเมล/)).not.toBeInTheDocument();
  });
});
