import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { SetupResources, type SetupResource } from './SetupResources';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: 'org', name: 'Restaurant' } },
    branchID: 'branch',
    can: () => true,
  }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

const location = {
  id: 'location',
  branch_id: 'branch',
  code: 'MAIN',
  name: 'Main stock',
  type: 'WAREHOUSE',
  status: 'ACTIVE',
  is_system: false,
};
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (path: string) => {
    if (path.includes('/inventory/locations'))
      return { items: [location], total: 1 };
    if (path.includes('/pos/terminals')) return { items: [], total: 0 };
    if (path.endsWith('/storefront')) return null;
    return { items: [], total: 0 };
  });
});
function mount(resource: SetupResource = 'source') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderInEnglish(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SetupResources resource={resource} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function fillTerminal() {
  fireEvent.change(await screen.findByLabelText('Terminal code'), {
    target: { value: 'pos-one' },
  });
  fireEvent.change(screen.getByLabelText('Terminal name'), {
    target: { value: 'Counter' },
  });
  fireEvent.change(screen.getByLabelText('Selling stock location'), {
    target: { value: 'location' },
  });
}

it('creates a terminal using only the current branch and a real selected stock source', async () => {
  mount();
  await fillTerminal();
  fireEvent.click(screen.getByRole('button', { name: 'Create terminal' }));
  await screen.findByText('POS terminal saved. Recheck readiness to continue.');
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org/pos/terminals',
    expect.objectContaining({
      method: 'POST',
      csrf: 'csrf',
      signal: expect.any(AbortSignal),
      body: {
        branch_id: 'branch',
        code: 'POS-ONE',
        name: 'Counter',
        stock_location_id: 'location',
        status: 'ACTIVE',
      },
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Create terminal' }),
  ).toBeDisabled();
});

it('does not offer inactive, system or another branch stock locations', async () => {
  mocks.request.mockResolvedValue({
    items: [
      location,
      { ...location, id: 'other', name: 'Other branch', branch_id: 'other' },
      { ...location, id: 'inactive', name: 'Inactive', status: 'INACTIVE' },
      { ...location, id: 'system', name: 'System', is_system: true },
    ],
    total: 4,
  });
  mount();
  await screen.findByLabelText('Selling stock location');
  expect(
    screen.queryByRole('option', { name: /Other branch|Inactive|System/ }),
  ).not.toBeInTheDocument();
});

it('locks terminal inputs while saving and retains entered values on failure', async () => {
  let reject!: (reason: Error) => void;
  mocks.request.mockImplementation(
    async (_path: string, options: { method?: string }) => {
      if (options.method === 'POST')
        return new Promise((_, fail) => {
          reject = fail;
        });
      return { items: [location], total: 1 };
    },
  );
  mount();
  await fillTerminal();
  fireEvent.click(screen.getByRole('button', { name: 'Create terminal' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create terminal' }),
    ).toBeDisabled(),
  );
  expect(screen.getByLabelText('Terminal code')).toBeDisabled();
  await act(async () => reject(new Error('Save failed')));
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  expect(screen.getByLabelText('Terminal name')).toHaveValue('Counter');
});

it('embeds real storefront settings without working-page or public-preview links', async () => {
  mount('storefront');
  expect(await screen.findByLabelText('Store display name')).toHaveValue(
    'Restaurant',
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});

it('does not post opening stock merely by opening setup configuration', async () => {
  mount('stock');
  await screen.findByRole('heading', { name: 'Opening Balance' });
  expect(mocks.request.mock.calls.every(([, options]) => !options.method)).toBe(
    true,
  );
});

it('requires confirmation and posts exact opening quantity through the scoped inventory command', async () => {
  const confirmation = vi
    .spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValue(true);
  mocks.request.mockImplementation(
    async (path: string, options: { method?: string }) => {
      if (options.method === 'POST') return { id: 'opening-balance' };
      if (path.includes('/inventory/locations'))
        return { items: [location], total: 1 };
      if (path.includes('/products?'))
        return {
          items: [{ variants: [{ id: 'variant', name: 'Rice', sku: 'RICE' }] }],
          total: 1,
        };
      return { items: [], total: 0 };
    },
  );
  try {
    mount('stock');
    await screen.findByRole('option', { name: 'RICE · Rice' });
    fireEvent.change(screen.getByLabelText('Source / Count Location'), {
      target: { value: 'location' },
    });
    fireEvent.change(screen.getByLabelText('Product Variant'), {
      target: { value: 'variant' },
    });
    fireEvent.change(screen.getByLabelText('Quantity 1'), {
      target: { value: '12.345' },
    });
    fireEvent.change(screen.getByLabelText('Reason / Reference'), {
      target: { value: 'SETUP' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Post Opening Balance' }),
    );
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(
      mocks.request.mock.calls.some(([, options]) => options.method === 'POST'),
    ).toBe(false);
    expect(screen.getByLabelText('Quantity 1')).toHaveValue('12.345');
    fireEvent.click(
      screen.getByRole('button', { name: 'Post Opening Balance' }),
    );
    await screen.findByText('บันทึกรายการแล้ว');
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/org/inventory/opening-balances',
      expect.objectContaining({
        method: 'POST',
        csrf: 'csrf',
        key: expect.any(String),
        signal: expect.any(AbortSignal),
        body: {
          location_id: 'location',
          reason_code: 'SETUP',
          notes: '',
          items: [
            {
              variant_id: 'variant',
              quantity: '12.345',
              batch_id: null,
              batch_verified: false,
            },
          ],
        },
      }),
    );
  } finally {
    confirmation.mockRestore();
  }
});
