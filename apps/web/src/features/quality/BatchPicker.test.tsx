import { render } from '../../test/render';
import { screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { BatchPicker, CartBatchPicker } from './BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn() }));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: 'org' } },
    branchID: 'branch',
    can: () => true,
  }),
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ state: { session: { user: { id: 'user' } } } }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));
function Harness() {
  const [value, setValue] = useState(untrackedBatch);
  return (
    <BatchPicker
      variant="variant"
      location="location"
      value={value}
      change={setValue}
      sellableOnly
    />
  );
}
function show(content = <Harness />) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {content}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.save.mockReset();
  mocks.request.mockResolvedValue([
    {
      id: 'balance',
      batch_id: 'lot',
      lot_number: 'OBSERVED',
      expires_on: null,
      quantity: '2.000',
      sellable: true,
    },
    {
      id: 'bad-balance',
      batch_id: 'bad-lot',
      lot_number: 'EXPIRED',
      expires_on: '2000-01-01',
      quantity: '1.000',
      sellable: false,
    },
  ]);
});
it('keeps legacy untracked and never automatically attests FEFO', async () => {
  show();
  await screen.findByRole('option', { name: /OBSERVED/ });
  expect(screen.getByLabelText('Batch/Lot')).toHaveValue('');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Batch/Lot'), {
    target: { value: 'lot' },
  });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox')).toBeChecked();
  fireEvent.change(screen.getByLabelText('Batch/Lot'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('Batch/Lot'), {
    target: { value: 'lot' },
  });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('option', { name: /EXPIRED/ })).toBeDisabled();
  expect(mocks.request.mock.calls[0][0]).toContain(
    'branch_id=branch&variant_id=variant&location_id=location',
  );
});
it('requires physical confirmation before applying tracked lot to cart', async () => {
  show(
    <CartBatchPicker
      variant="variant"
      location="location"
      initial={untrackedBatch}
      save={mocks.save}
      busy={false}
    />,
  );
  await screen.findByRole('option', { name: /OBSERVED/ });
  fireEvent.change(screen.getByLabelText('Batch/Lot'), {
    target: { value: 'lot' },
  });
  expect(screen.getByRole('button', { name: 'ใช้ lot นี้' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'ใช้ lot นี้' }));
  expect(mocks.save).toHaveBeenCalledWith({
    batch_id: 'lot',
    batch_verified: true,
  });
});
it('shows load failure without fabricating options', async () => {
  mocks.request.mockRejectedValue(new Error('Quality unavailable'));
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Quality unavailable',
  );
  expect(
    screen.queryByRole('option', { name: /OBSERVED/ }),
  ).not.toBeInTheDocument();
});

it('renders lot pagination with aligned badge and buttons', async () => {
  show();
  await screen.findByRole('option', { name: /OBSERVED/ });
  const pageBadge = screen.getByText('หน้า 1');
  expect(pageBadge).toBeVisible();
  expect(pageBadge).toHaveClass('batch-picker-page');
  const paginationContainer = pageBadge.closest('.batch-picker-pagination');
  expect(paginationContainer).toBeInTheDocument();
  const prevBtn = screen.getByRole('button', { name: 'ล็อตก่อนหน้า' });
  const nextBtn = screen.getByRole('button', { name: 'ล็อตถัดไป' });
  expect(prevBtn).toHaveClass('button-secondary', 'button-compact');
  expect(nextBtn).toHaveClass('button-secondary', 'button-compact');
});
