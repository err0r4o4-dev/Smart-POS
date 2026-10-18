import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { AccountPage } from './AuthPages';

const mocks = vi.hoisted(() => ({
  role: 'OWNER',
  hasStore: true,
  signOut: vi.fn(),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: {
          id: 'account-user',
          display_name: 'Example User',
          email: 'account@example.test',
          status: 'ACTIVE',
        },
      },
    },
    signOut: mocks.signOut,
  }),
}));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    branchID: 'account-branch',
    context: mocks.hasStore
      ? {
          organization: { id: 'account-store', name: 'Example Store' },
          membership: { role: mocks.role },
          branches: [{ id: 'account-branch', name: 'Main branch' }],
        }
      : null,
  }),
}));

beforeEach(() => {
  mocks.role = 'OWNER';
  mocks.hasStore = true;
  mocks.signOut.mockReset();
});

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('keeps the original account details and links without extra workspace information', () => {
  renderAccount();
  const details = screen.getByRole('region', { name: 'Your account' });
  expect(within(details).getByText('Example User')).toBeVisible();
  expect(within(details).getByText('account@example.test')).toBeVisible();
  expect(
    within(details).getByRole('link', {
      name: 'Open your role-based workspace',
    }),
  ).toHaveAttribute('href', '/workspace');
  expect(
    screen.getByRole('link', { name: 'Manage organization and branches' }),
  ).toHaveAttribute('href', '/manage/settings/store');
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.queryByText('Example Store')).toBeNull();
  expect(screen.queryByText('Main branch')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Your workspace' })).toBeNull();
});

it('keeps store administration out of a cashier account', () => {
  mocks.role = 'CASHIER';
  renderAccount();
  expect(
    screen.getByRole('link', { name: 'Open your role-based workspace' }),
  ).toHaveAttribute('href', '/workspace');
  expect(
    screen.queryByRole('link', { name: 'Manage organization and branches' }),
  ).toBeNull();
});

it('offers store setup without inventing a current store when none is selected', () => {
  mocks.hasStore = false;
  renderAccount();
  expect(
    screen.getByRole('link', {
      name: 'Select organization / Set up store / Accept invitation',
    }),
  ).toHaveAttribute('href', '/setup');
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.queryByText('Example Store')).toBeNull();
  expect(screen.queryByText('Main branch')).toBeNull();
  expect(
    screen.queryByRole('link', { name: 'Manage organization and branches' }),
  ).toBeNull();
});

it('prevents duplicate logout, preserves a failed account view, and allows retry', async () => {
  let rejectLogout: (error: Error) => void = () => undefined;
  mocks.signOut.mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        rejectLogout = reject;
      }),
  );
  renderAccount();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const pending = screen.getByRole('button', { name: 'Signing out…' });
  expect(pending).toBeDisabled();
  fireEvent.click(pending);
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
  await act(async () => rejectLogout(new Error('Logout request unavailable')));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Logout request unavailable',
  );
  expect(screen.getByText('account@example.test')).toBeVisible();
  mocks.signOut.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('Login destination')).toBeVisible();
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
});
