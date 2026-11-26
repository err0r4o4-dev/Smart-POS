import { render } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ReturnsPage } from './ReturnsPage';

const mocks = vi.hoisted(() => ({
  policy: 'MENU_ONLY' as string | undefined,
  paths: [] as string[],
  run: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ state: { session: { user: { id: 'u' } } } }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: 'o' } },
    branchID: 'b',
    can: () => true,
  }),
}));
vi.mock('./returns-hooks', () => ({
  useReturnsCommand: () => ({ run: mocks.run, busy: false, error: null }),
  useReturnsQuery: (path: string) => {
    mocks.paths.push(path);
    const data = path.startsWith('/returns/sales/')
      ? {
          id: 'sale',
          sale_number: 'S-1',
          branch_id: 'b',
          stock_policy: mocks.policy,
          items: [
            {
              id: 'line',
              variant_id: 'v',
              sku: 'DISH',
              product_name: 'Dish',
              returnable_quantity: '2.000',
              returned_quantity: '0',
              line_total: '20.00',
              stock_location_id: 'loc',
            },
          ],
        }
      : path.startsWith('/sales?')
        ? {
            items: [{ id: 'sale', sale_number: 'S-1', grand_total: '20.00' }],
            total: 1,
          }
        : path.startsWith('/inventory/locations')
          ? {
              items: [
                {
                  id: 'loc',
                  name: 'Warehouse',
                  status: 'ACTIVE',
                  type: 'WAREHOUSE',
                },
              ],
              total: 1,
            }
          : { items: [], total: 0 };
    return { data, isPending: false, error: null, refetch: mocks.refetch };
  },
}));
vi.mock('../quality/BatchPicker', () => ({
  BatchPicker: () => <span>Batch picker</span>,
}));
beforeEach(() => {
  mocks.policy = 'MENU_ONLY';
  mocks.paths = [];
  mocks.run.mockReset();
});
function setup() {
  render(
    <MemoryRouter>
      <ReturnsPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('เลือก'), {
    target: { value: 'sale' },
  });
}
it('creates a financial-only menu return without loading stock locations or batch controls', async () => {
  setup();
  expect(mocks.paths.some((path) => path.startsWith('/inventory/'))).toBe(
    false,
  );
  expect(screen.queryByText('Batch picker')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/การจัดการสต็อก/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('จำนวนคืน DISH'), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByLabelText('เหตุผลคืนสินค้า / หลักฐานตรวจสภาพ'), {
    target: { value: 'reason' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'บันทึกฉบับร่างคืนสินค้า' }),
  );
  await waitFor(() =>
    expect(mocks.run).toHaveBeenCalledWith(
      '/returns',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            disposition: 'NO_STOCK_RETURN',
            destination_location_id: null,
            batch_id: null,
            batch_verified: false,
          }),
        ],
      }),
    ),
  );
});
it.each([undefined, 'FUTURE'])(
  'blocks creation for invalid policy %s without stock requests',
  (policy) => {
    mocks.policy = policy;
    setup();
    expect(mocks.paths.some((path) => path.startsWith('/inventory/'))).toBe(
      false,
    );
    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'บันทึกฉบับร่างคืนสินค้า' }),
    ).not.toBeInTheDocument();
  },
);
it('retains stock controls for a tracked historical sale', () => {
  mocks.policy = 'TRACKED';
  setup();
  expect(
    mocks.paths.some((path) => path.startsWith('/inventory/locations')),
  ).toBe(true);
  expect(screen.getByText('Batch picker')).toBeVisible();
  expect(screen.getByLabelText(/การจัดการสต็อก/)).toHaveValue(
    'RESTOCK_SELLABLE',
  );
});
