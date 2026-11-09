import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceArea } from '../app/access';
import {
  render as renderInThai,
  renderInEnglish as render,
} from '../test/render';
import { WorkspaceShell } from './ManagementLayout';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  authState: { status: 'anonymous', session: null } as
    | { status: 'anonymous'; session: null }
    | {
        status: 'authenticated';
        session: {
          user: {
            id: string;
            display_name: string;
            email: string;
            status: string;
          };
          csrf_token: string;
        };
      },
}));

vi.mock('../app/AuthProvider', () => ({
  useAuth: () => ({ state: mocks.authState, signOut: mocks.signOut }),
}));
vi.mock('../app/OrganizationProvider', () => ({
  useOrganization: () => ({ context: null, loading: false, error: null }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.authState = { status: 'anonymous', session: null };
  mocks.signOut.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.close = vi.fn();
});

function renderShell(
  area: WorkspaceArea,
  initialEntries = ['/'],
  useThai = false,
) {
  const renderFn = useThai ? renderInThai : render;
  return renderFn(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route element={<WorkspaceShell area={area} />}>
          <Route index element={<h1>Workspace content</h1>} />
          <Route path="/settings" element={<h1>Settings page</h1>} />
          <Route path="/dashboard" element={<h1>Dashboard page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

it('omits the footer from the account shell without removing page content', () => {
  renderShell('account');

  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Workspace content' }),
  ).toBeVisible();
  expect(screen.getByRole('banner')).toBeVisible();
});

it('preserves the footer in the management shell', () => {
  renderShell('management');

  expect(screen.getByRole('contentinfo')).toHaveTextContent(
    'The customer storefront is separate from the team workspace',
  );
});

it('renders a profile dropdown menu on the avatar with Settings and Sign out actions in Thai', async () => {
  mocks.authState = {
    status: 'authenticated',
    session: {
      user: {
        id: 'user-1',
        display_name: 'Title Owner',
        email: 'title@example.test',
        status: 'ACTIVE',
      },
      csrf_token: 'csrf-1',
    },
  };

  renderShell('management', ['/dashboard'], true);

  const avatarButton = screen.getByRole('button', { name: 'บัญชีของคุณ' });
  expect(avatarButton).toHaveClass('avatar');
  expect(avatarButton).toHaveTextContent('T');
  expect(avatarButton).toHaveAttribute('aria-haspopup', 'menu');
  expect(avatarButton).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(avatarButton);
  expect(avatarButton).toHaveAttribute('aria-expanded', 'true');

  const menu = screen.getByRole('menu', { name: 'บัญชีของคุณ' });
  expect(within(menu).getByText('Title Owner')).toBeVisible();
  expect(within(menu).getByText('title@example.test')).toBeVisible();

  const settingsItem = within(menu).getByRole('menuitem', {
    name: 'การตั้งค่า',
  });
  const signOutItem = within(menu).getByRole('menuitem', {
    name: 'ออกจากระบบ',
  });
  expect(settingsItem).toHaveAttribute('href', '/settings');
  expect(signOutItem).toBeVisible();

  fireEvent.click(settingsItem);
  expect(
    screen.getByRole('heading', { name: 'Settings page' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(avatarButton).toHaveClass('avatar', 'active');
  expect(avatarButton).toHaveAttribute('aria-current', 'page');

  fireEvent.click(avatarButton);
  fireEvent.click(
    within(screen.getByRole('menu')).getByRole('menuitem', {
      name: 'ออกจากระบบ',
    }),
  );

  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
  expect(
    await screen.findByRole('heading', { name: 'Login page' }),
  ).toBeVisible();
});

it('closes the profile dropdown on Escape and outside click, and shows recoverable logout errors', async () => {
  mocks.authState = {
    status: 'authenticated',
    session: {
      user: {
        id: 'user-1',
        display_name: 'Title Owner',
        email: 'title@example.test',
        status: 'ACTIVE',
      },
      csrf_token: 'csrf-1',
    },
  };
  mocks.signOut.mockRejectedValueOnce(new Error('Logout unavailable'));

  renderShell('management', ['/settings'], false);

  const avatarButton = screen.getByRole('button', { name: 'Your account' });
  fireEvent.click(avatarButton);
  expect(screen.getByRole('menu', { name: 'Your account' })).toBeVisible();

  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(avatarButton).toHaveFocus();

  fireEvent.click(avatarButton);
  expect(screen.getByRole('menu')).toBeVisible();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();

  fireEvent.click(avatarButton);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Logout unavailable',
  );
  expect(screen.getByRole('menu')).toBeVisible();
});

it('supports ArrowDown/ArrowUp keyboard navigation in the profile dropdown and renders a sign-in link when anonymous', () => {
  renderShell('account', ['/'], false);
  const signInLink = screen.getByRole('link', { name: 'Sign in' });
  expect(signInLink).toHaveClass('avatar');
  expect(signInLink).toHaveAttribute('href', '/login');
  expect(signInLink).toHaveTextContent('—');

  mocks.authState = {
    status: 'authenticated',
    session: {
      user: {
        id: 'user-1',
        display_name: 'Title Owner',
        email: 'title@example.test',
        status: 'ACTIVE',
      },
      csrf_token: 'csrf-1',
    },
  };
  renderShell('management', ['/dashboard'], false);

  const avatarButton = screen.getByRole('button', { name: 'Your account' });
  fireEvent.keyDown(avatarButton, { key: 'ArrowDown' });

  const menu = screen.getByRole('menu', { name: 'Your account' });
  const settingsItem = within(menu).getByRole('menuitem', { name: 'Settings' });
  const signOutItem = within(menu).getByRole('menuitem', { name: 'Sign out' });

  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(settingsItem).toHaveFocus();

  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(signOutItem).toHaveFocus();

  fireEvent.keyDown(menu, { key: 'ArrowUp' });
  expect(settingsItem).toHaveFocus();
});

it('renders breadcrumb home icon as a link navigating to home page', () => {
  renderShell('management', ['/dashboard'], true);

  const homeLink = screen.getByRole('link', { name: 'หน้าหลัก' });
  expect(homeLink).toHaveClass('breadcrumb-home');
  expect(homeLink).toHaveAttribute('href', '/');
});
