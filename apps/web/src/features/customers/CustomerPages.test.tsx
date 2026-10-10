import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersPage } from './CustomerPages';
const mocks = vi.hoisted(() => ({
  org: 'org-a',
  branch: 'branch-a',
  manage: true,
  request: vi.fn(),
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: mocks.org } },
    branchID: mocks.branch,
    can: (permission: string) => mocks.manage || permission.endsWith('.read'),
  }),
}));
vi.mock('../../lib/customers-api', async () => {
  const actual = await vi.importActual<
    typeof import('../../lib/customers-api')
  >('../../lib/customers-api');
  return { ...actual, customerRequest: mocks.request };
});
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}
beforeEach(() => {
  mocks.org = 'org-a';
  mocks.branch = 'branch-a';
  mocks.manage = true;
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 25,
  });
});
describe('Customer pages', () => {
  it('does not reuse unmasked data after customer manage permission is revoked', async () => {
    mocks.request.mockImplementation((_org: string, path: string) =>
      Promise.resolve({
        items:
          path === '/customers/search'
            ? [
                {
                  id: 'customer',
                  code: 'A',
                  name: 'Customer',
                  phone: '0812345678',
                  email: 'private@example.test',
                  status: 'ACTIVE',
                  groups: [],
                },
              ]
            : [],
        total: 1,
        page: 1,
        page_size: 25,
      }),
    );
    const view = render(<CustomersPage />, { wrapper: wrapper() });
    await screen.findByText(/0812345678/);
    mocks.manage = false;
    mocks.request.mockReturnValue(new Promise(() => {}));
    view.rerender(<CustomersPage />);
    expect(screen.queryByText(/0812345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private@example.test/)).not.toBeInTheDocument();
  });
  it('shows an empty state and opt-in form without required contact details', async () => {
    render(<CustomersPage />, { wrapper: wrapper() });
    await screen.findByText(/ไม่พบลูกค้า ลองเปลี่ยน/);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลูกค้า' }));
    expect(screen.getByLabelText('โทรศัพท์')).not.toBeRequired();
    expect(screen.getByLabelText('อีเมล')).not.toBeRequired();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('hides create for read-only permissions', async () => {
    mocks.manage = false;
    render(<CustomersPage />, { wrapper: wrapper() });
    await screen.findByText(/ไม่พบลูกค้า ลองเปลี่ยน/);
    expect(
      screen.queryByRole('button', { name: 'เพิ่มลูกค้า' }),
    ).not.toBeInTheDocument();
  });
  it('renders a real error with retry', async () => {
    mocks.request.mockRejectedValue(new Error('unavailable'));
    render(<CustomersPage />, { wrapper: wrapper() });
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeInTheDocument();
  });
  it('shows loading while customer data is pending', () => {
    mocks.request.mockReturnValue(new Promise(() => {}));
    render(<CustomersPage />, { wrapper: wrapper() });
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลดลูกค้า');
  });
  it('does not display previous organization PII after switching context', async () => {
    mocks.request.mockImplementation((org: string, path: string) =>
      Promise.resolve({
        items:
          path === '/customers/search' && org === 'org-a'
            ? [
                {
                  id: 'customer',
                  code: 'A',
                  name: 'Private old tenant',
                  phone: '',
                  email: '',
                  status: 'ACTIVE',
                  groups: [],
                },
              ]
            : [],
        total: org === 'org-a' ? 1 : 0,
        page: 1,
        page_size: 25,
      }),
    );
    const view = render(<CustomersPage />, { wrapper: wrapper() });
    await screen.findByText(/Private old tenant/);
    mocks.org = 'org-b';
    mocks.branch = 'branch-b';
    view.rerender(<CustomersPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Private old tenant/)).not.toBeInTheDocument(),
    );
    expect(mocks.request).toHaveBeenCalledWith(
      'org-b',
      '/customers/search',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
