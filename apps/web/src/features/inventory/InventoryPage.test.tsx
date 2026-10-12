import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { InventoryPage } from './InventoryPage';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: { id: 'org' },
      branches: [{ id: 'branch', name: 'สาขาทดสอบ' }],
    },
    branchID: 'branch',
    can: () => true,
  }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (_path, options) => {
    if (options?.signal?.aborted)
      throw new DOMException('Aborted', 'AbortError');
    return options?.method
      ? { id: 'location' }
      : { items: [], total: 0, page: 1, page_size: 20 };
  });
});

function renderLocations() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/manage/inventory/locations']}>
          <InventoryPage section="locations" />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

it('saves a location under StrictMode using a live signal and the existing payload', async () => {
  renderLocations();
  fireEvent.change(await screen.findByLabelText('Location code'), {
    target: { value: 'test' },
  });
  fireEvent.change(screen.getByLabelText('Location name'), {
    target: { value: 'คลังทดสอบ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก Location' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Location code')).toHaveValue(''),
  );
  const call = mocks.request.mock.calls.find(
    ([, options]) => options?.method === 'POST',
  );
  expect(call?.[0]).toBe('/organizations/org/inventory/locations');
  expect(call?.[1]).toMatchObject({
    csrf: 'csrf',
    body: { branch_id: 'branch', code: 'TEST', name: 'คลังทดสอบ', revision: 0 },
  });
  expect(call?.[1].signal.aborted).toBe(false);
});

it('preserves location input on a failed save so it can be retried', async () => {
  mocks.request.mockImplementation(async (_path, options) => {
    if (options?.method) throw new Error('การเชื่อมต่อขัดข้อง');
    return { items: [], total: 0, page: 1, page_size: 20 };
  });
  renderLocations();
  fireEvent.change(await screen.findByLabelText('Location code'), {
    target: { value: 'test' },
  });
  fireEvent.change(screen.getByLabelText('Location name'), {
    target: { value: 'คลังทดสอบ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก Location' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'การเชื่อมต่อขัดข้อง',
  );
  expect(screen.getByLabelText('Location code')).toHaveValue('test');
  expect(screen.getByLabelText('Location name')).toHaveValue('คลังทดสอบ');
});

it('retries failed location options as well as the main inventory list', async () => {
  let unavailable = true;
  mocks.request.mockImplementation(async (path) => {
    if (unavailable && path.includes('page_size=100'))
      throw new Error('โหลดตัวเลือกสถานที่เก็บไม่สำเร็จ');
    return { items: [], total: 0, page: 1, page_size: 20 };
  });
  renderLocations();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดตัวเลือกสถานที่เก็บไม่สำเร็จ',
  );
  unavailable = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'บันทึก Location' })).toBeEnabled();
});
