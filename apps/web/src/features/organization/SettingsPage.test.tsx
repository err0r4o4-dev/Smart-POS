import { render, renderInEnglish } from '../../test/render';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { ApiError } from '../../lib/api';
import { useLanguage } from '../../app/language';

const mocks = vi.hoisted(() => ({
  posRequest: vi.fn(),
  orgRequest: vi.fn(),
  canUpdate: true,
  userID: 'user-1',
  branch: 'branch-1',
  refresh: vi.fn(),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: { id: mocks.userID, display_name: 'Owner' },
        csrf_token: 'test-csrf-token',
      },
    },
  }),
}));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: {
        id: 'org-123',
        name: 'Test Restaurant',
        code: 'VELO-01',
        business_type: 'restaurant',
        contact_phone: '',
        contact_email: 'owner@example.test',
        address: '123 ถ.สุขุมวิท ต.คลองตัน อ.คลองตัน จ.กรุงเทพฯ 26120',
      },
      membership: { role: 'OWNER' },
    },
    branchID: mocks.branch,
    refresh: mocks.refresh,
    can: (permission: string) =>
      permission === 'organization.update' ? mocks.canUpdate : true,
  }),
}));

vi.mock('../../lib/pos-api', () => ({
  posRequest: mocks.posRequest,
}));

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.orgRequest,
}));

function LanguageSwitch() {
  const { setLanguage } = useLanguage();
  return <button onClick={() => setLanguage('th')}>Thai</button>;
}

function renderPage(english = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (english ? renderInEnglish : render)(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
        <LanguageSwitch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('changes language without losing edited store details', () => {
  renderPage(true);
  fireEvent.change(screen.getByLabelText(/Restaurant name/), {
    target: { value: 'My restaurant' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
  expect(screen.getByLabelText(/ชื่อร้านอาหาร/)).toHaveValue('My restaurant');
  expect(
    screen.queryByRole('option', { name: 'ร้านอาหาร' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'ร้านอาหาร (Restaurant)' }),
  ).not.toBeInTheDocument();
});

const hours = {
  branch_id: 'branch-1',
  closing_time: '21:45',
  timezone: 'Asia/Bangkok',
  revision: 7,
};
function mockHours(overrides = {}) {
  mocks.posRequest.mockImplementation(async (_org, path) =>
    path.startsWith('/restaurant/settings?')
      ? { ...hours, ...overrides }
      : null,
  );
}

beforeEach(() => {
  mocks.posRequest.mockReset();
  mocks.orgRequest.mockReset();
  mocks.canUpdate = true;
  mocks.userID = 'user-1';
  mocks.branch = 'branch-1';
  mockHours();
});

it('sends the existing organization code and does not save branch hours with store details', async () => {
  mocks.posRequest.mockResolvedValue({
    branch_id: 'branch-1',
    closing_time: '21:45',
    timezone: 'Asia/Bangkok',
    revision: 7,
  });
  mocks.orgRequest.mockResolvedValue({});
  renderPage(true);
  fireEvent.change(screen.getByLabelText(/Restaurant name/), {
    target: { value: 'Updated restaurant' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(mocks.orgRequest).toHaveBeenCalledWith(
      '/organizations/org-123',
      expect.objectContaining({
        body: expect.objectContaining({
          name: 'Updated restaurant',
          code: 'VELO-01',
        }),
      }),
    ),
  );
  expect(
    mocks.posRequest.mock.calls.some(
      ([, , options]) => options?.method === 'PATCH',
    ),
  ).toBe(false);
});

it('loads branch hours and retains edited hours after the server rejects the save', async () => {
  const saved = {
    branch_id: 'branch-1',
    closing_time: '21:45',
    timezone: 'Asia/Bangkok',
    revision: 7,
  };
  mocks.posRequest.mockImplementation(async (_org, path, options) => {
    if (options?.method === 'PATCH')
      throw new Error('Another user changed these hours');
    return path.startsWith('/restaurant/settings?') ? saved : null;
  });
  renderPage(true);
  expect(await screen.findByText('Closing time: 21:45')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Business day closing time'), {
    target: { value: '23:15' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save closing time' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another user changed these hours',
  );
  expect(screen.getByLabelText('Business day closing time')).toHaveValue(
    '23:15',
  );
  expect(screen.queryByText('Closing time saved')).not.toBeInTheDocument();
  expect(mocks.posRequest).toHaveBeenCalledWith(
    'org-123',
    '/restaurant/settings',
    expect.objectContaining({
      method: 'PATCH',
      body: {
        branch_id: 'branch-1',
        closing_time: '23:15',
        timezone: 'Asia/Bangkok',
        revision: 7,
      },
    }),
  );
});

it('renders the supported settings without exposing controls that cannot be saved', async () => {
  renderPage(true);
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Restaurant name/)).toHaveValue(
    'Test Restaurant',
  );
  expect(
    screen.queryByRole('checkbox', { name: 'Cash' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Change logo')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Go to online store settings' }),
  ).toHaveAttribute('href', '/settings/storefront');
});

it('formats the current business period in the selected language and time zone', async () => {
  const period = { start: '2026-11-04T15:00:00Z', end: '2026-11-05T15:00:00Z' };
  mockHours({ period });
  renderPage(true);
  const format = (value: string, locale: string) =>
    new Date(value).toLocaleString(locale, { timeZone: 'Asia/Bangkok' });
  expect(
    await screen.findByText(
      `Current period: ${format(period.start, 'en-GB')} to ${format(period.end, 'en-GB')}`,
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
  expect(
    screen.getByText(
      `รอบปัจจุบัน: ${format(period.start, 'th-TH')} ถึง ${format(period.end, 'th-TH')}`,
    ),
  ).toBeInTheDocument();
});

it('does not request or write operating hours for a restaurant without a branch', () => {
  mocks.branch = '';
  renderPage();
  expect(screen.getByText('เลือกสาขาก่อนจัดการร้านอาหาร')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'บันทึกเวลาปิดร้าน' }),
  ).not.toBeInTheDocument();
  expect(
    mocks.posRequest.mock.calls.some(([, path]) =>
      path.startsWith('/restaurant/settings'),
    ),
  ).toBe(false);
});

it('uses the revision returned by each successful hours save', async () => {
  let revision = 7;
  mocks.posRequest.mockImplementation(async (_org, path, options) => {
    if (options?.method === 'PATCH') {
      expect(options.body.revision).toBe(revision);
      return {
        ...hours,
        closing_time: options.body.closing_time,
        revision: ++revision,
      };
    }
    return path.startsWith('/restaurant/settings?') ? hours : null;
  });
  renderPage(true);
  const input = await screen.findByLabelText('Business day closing time');
  for (const time of ['23:00', '23:30']) {
    fireEvent.change(input, { target: { value: time } });
    fireEvent.click(screen.getByRole('button', { name: 'Save closing time' }));
    expect(
      await screen.findByText('Closing time: ' + time),
    ).toBeInTheDocument();
  }
  expect(screen.getByText('Closing time saved')).toBeInTheDocument();
});

it('reloads a conflicting revision without discarding the owner’s draft', async () => {
  let current = hours;
  mocks.posRequest.mockImplementation(async (_org, path, options) => {
    if (options?.method === 'PATCH') {
      if (options.body.revision !== current.revision)
        throw new ApiError(409, 'The hours changed');
      current = {
        ...current,
        revision: current.revision + 1,
        closing_time: options.body.closing_time,
      };
      return current;
    }
    return path.startsWith('/restaurant/settings?') ? current : null;
  });
  renderPage(true);
  const input = await screen.findByLabelText('Business day closing time');
  fireEvent.change(input, { target: { value: '23:30' } });
  current = { ...current, closing_time: '20:00', revision: 8 };
  fireEvent.click(screen.getByRole('button', { name: 'Save closing time' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The hours changed',
  );
  expect(
    screen.getByRole('button', { name: 'Save closing time' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload current closing time' }),
  );
  expect(await screen.findByText('Closing time: 20:00')).toBeInTheDocument();
  expect(input).toHaveValue('23:30');
  fireEvent.click(screen.getByRole('button', { name: 'Save closing time' }));
  expect(await screen.findByText('Closing time: 23:30')).toBeInTheDocument();
});

it('links the storefront button to the store website using active slug', async () => {
  mocks.posRequest.mockImplementation((_org: string, path: string) => {
    if (path === '/storefront') {
      return Promise.resolve({ slug: 'velocafe', name: 'VELO Cafe' });
    }
    return Promise.resolve({});
  });
  renderPage();

  const link = await screen.findByRole('link', { name: 'ดูหน้าร้าน' });
  await waitFor(() => expect(link).toHaveAttribute('href', '/shop/velocafe'));
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

it('loads the storefront link separately for each account in the same organization', async () => {
  let calls = 0;
  mocks.posRequest.mockImplementation(async (_org, path) =>
    path === '/storefront'
      ? { slug: ++calls === 1 ? 'first-store' : 'second-store' }
      : hours,
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { rerender } = renderInEnglish(page());
  const link = screen.getByRole('link', { name: 'View storefront' });
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/shop/first-store'),
  );

  mocks.userID = 'user-2';
  rerender(page());
  expect(screen.getByRole('link', { name: 'View storefront' })).toHaveAttribute(
    'href',
    '/shop',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'View storefront' }),
    ).toHaveAttribute('href', '/shop/second-store'),
  );
});

it('keeps the current account storefront link when a prior request resolves late', async () => {
  let resolvePriorRequest!: (settings: { slug: string }) => void;
  const priorRequest = new Promise<{ slug: string }>((resolve) => {
    resolvePriorRequest = resolve;
  });
  let calls = 0;
  mocks.posRequest.mockImplementation((_org, path) =>
    path === '/storefront'
      ? ++calls === 1
        ? priorRequest
        : Promise.resolve({ slug: 'current-store' })
      : Promise.resolve(hours),
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { rerender } = renderInEnglish(page());
  await waitFor(() =>
    expect(mocks.posRequest).toHaveBeenCalledWith(
      'org-123',
      '/storefront',
      expect.anything(),
    ),
  );
  const priorSignal = mocks.posRequest.mock.calls.find(
    ([, path]) => path === '/storefront',
  )![2].signal;

  mocks.userID = 'user-2';
  rerender(page());
  expect(screen.getByRole('link', { name: 'View storefront' })).toHaveAttribute(
    'href',
    '/shop',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'View storefront' }),
    ).toHaveAttribute('href', '/shop/current-store'),
  );
  expect(priorSignal.aborted).toBe(true);

  await act(async () => {
    resolvePriorRequest({ slug: 'prior-store' });
    await priorRequest;
  });
  expect(screen.getByRole('link', { name: 'View storefront' })).toHaveAttribute(
    'href',
    '/shop/current-store',
  );
});
