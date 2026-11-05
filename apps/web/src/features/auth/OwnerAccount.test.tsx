import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { AccountPage } from './AuthPages';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  refresh: vi.fn(),
  storeMode: 'multi' as 'multi' | 'single',
  role: null as string | null,
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: {
          display_name: 'Legacy User',
          email: 'legacy@example.test',
          status: 'ACTIVE',
        },
      },
    },
    signOut: mocks.signOut,
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: mocks.role ? { membership: { role: mocks.role } } : null,
    storeMode: mocks.storeMode,
    loading: false,
    error: '',
    refresh: mocks.refresh,
  }),
}));

it('offers first store setup while preserving sign out', async () => {
  mocks.signOut.mockResolvedValueOnce(undefined);
  render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'You do not have an owned store',
  );
  expect(screen.getByRole('link', { name: /set up store/i })).toHaveAttribute(
    'href',
    '/setup',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(mocks.signOut).toHaveBeenCalledOnce();
});

it('does not offer setup without access in single-store mode', () => {
  mocks.storeMode = 'single';
  render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('link', { name: /set up store/i }),
  ).not.toBeInTheDocument();
  mocks.storeMode = 'multi';
});

it.each(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'does not expose existing organization tools for a stale %s context',
  (role) => {
    mocks.role = role;
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('link', { name: /set up store/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open store management/i }),
    ).not.toBeInTheDocument();
    mocks.role = null;
  },
);
