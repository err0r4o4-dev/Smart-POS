import { render } from '../../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SetupPage } from './OrganizationPages';
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  storeMode: 'multi' as 'single' | 'multi',
  role: 'OWNER' as string | null,
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: {
          id: 'user',
          email: 'owner@example.test',
          display_name: 'Owner',
        },
        csrf_token: 'csrf',
      },
    },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    storeMode: mocks.storeMode,
    organizations: [],
    context: mocks.role ? { membership: { role: mocks.role } } : null,
    refresh: mocks.refresh,
    select: mocks.select,
  }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeMode = 'multi';
  mocks.role = 'OWNER';
  mocks.refresh.mockResolvedValue(undefined);
});
it('does not offer organization creation for an account outside the configured store', () => {
  mocks.storeMode = 'single';
  mocks.role = null;
  render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>,
  );
  expect(screen.queryByLabelText('ชื่อองค์กร')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'ถัดไป' }),
  ).not.toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
});
it('creates a first organization for an authenticated account without an owned organization', async () => {
  mocks.role = null;
  mocks.request.mockResolvedValue({ organization: { id: 'new-org' } });
  render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>,
  );
  expect(screen.getByLabelText('ชื่อองค์กร')).toBeRequired();
  expect(screen.getByLabelText('รหัสองค์กร')).toBeRequired();
  fireEvent.change(screen.getByLabelText('ชื่อองค์กร'), {
    target: { value: 'ร้านตัวอย่าง' },
  });
  fireEvent.change(screen.getByLabelText('รหัสองค์กร'), {
    target: { value: 'THAI' },
  });
  fireEvent.click(screen.getByText('ถัดไป'));
  expect(screen.getByLabelText('ชื่อสาขา')).toHaveValue('สาขาหลัก');
  fireEvent.click(screen.getByText('ถัดไป'));
  expect(
    screen.getByText('owner@example.test', { exact: false }),
  ).toBeVisible();
  fireEvent.click(screen.getByText('สร้างร้าน'));
  await screen.findByText('กำลังบันทึก…');
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations',
    expect.objectContaining({
      method: 'POST',
      csrf: 'csrf',
      key: expect.any(String),
      body: expect.objectContaining({
        name: 'ร้านตัวอย่าง',
        code: 'THAI',
        branch: expect.objectContaining({ code: 'MAIN', status: 'ACTIVE' }),
      }),
    }),
  );
});
it('retains the same idempotency key for a failed submission retry', async () => {
  mocks.request.mockRejectedValue(new Error('Delivery unavailable'));
  render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('ชื่อองค์กร'), {
    target: { value: 'Store' },
  });
  fireEvent.change(screen.getByLabelText('รหัสองค์กร'), {
    target: { value: 'STORE' },
  });
  fireEvent.click(screen.getByText('ถัดไป'));
  fireEvent.click(screen.getByText('ถัดไป'));
  fireEvent.click(screen.getByText('สร้างร้าน'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Delivery unavailable',
  );
  fireEvent.click(screen.getByText('สร้างร้าน'));
  await screen.findByRole('alert');
  expect(mocks.request.mock.calls[0][1].key).toBe(
    mocks.request.mock.calls[1][1].key,
  );
});

it.each(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'does not offer setup or creation to %s',
  (role) => {
    mocks.role = role;
    render(
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('ชื่อองค์กร')).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
