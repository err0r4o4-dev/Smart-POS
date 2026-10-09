import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
import type { AuthSession } from '../lib/api';

const requests = vi.hoisted(() => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../lib/api', () => requests);

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'person@example.test',
    display_name: 'Person',
    status: 'ACTIVE',
    onboarding: 'PENDING_ORGANIZATION',
  },
  csrf_token: 'csrf-value',
};

function Probe() {
  const { state, signIn, signOut, refresh, clear } = useAuth();
  return (
    <div>
      <output>{state.status}</output>
      <button onClick={() => void signIn('person@example.test', 'password')}>
        Sign in
      </button>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={() => void refresh()}>Refresh</button>
      <button onClick={clear}>Clear</button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

it('restores the persisted session and signs out through the CSRF-protected API', async () => {
  requests.getSession.mockResolvedValue(session);
  requests.logout.mockResolvedValue({ revoked: true });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('authenticated')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('anonymous')).toBeVisible();
  expect(requests.logout).toHaveBeenCalledWith(session.csrf_token);
});

it('does not let a stale session lookup overwrite a new login or password reset', async () => {
  let resolveLookup!: (value: AuthSession | null) => void;
  requests.getSession.mockReturnValue(
    new Promise<AuthSession | null>((resolve) => {
      resolveLookup = resolve;
    }),
  );
  requests.login.mockResolvedValue(session);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('authenticated')).toBeVisible();
  await act(async () => resolveLookup(null));
  expect(screen.getByText('authenticated')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.getByText('anonymous')).toBeVisible();
});

it('ignores a pending login after the session is cleared', async () => {
  let resolveLogin!: (value: AuthSession) => void;
  requests.getSession.mockResolvedValue(null);
  requests.login.mockReturnValue(
    new Promise<AuthSession>((resolve) => {
      resolveLogin = resolve;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('anonymous')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await act(async () => resolveLogin(session));
  expect(screen.getByText('anonymous')).toBeVisible();
});

it('does not let a pending logout overwrite a newer login', async () => {
  let resolveLogout!: (value: { revoked: boolean }) => void;
  requests.getSession.mockResolvedValue(session);
  requests.login.mockResolvedValue(session);
  requests.logout.mockReturnValue(
    new Promise<{ revoked: boolean }>((resolve) => {
      resolveLogout = resolve;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('authenticated')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await act(async () => {});
  await act(async () => resolveLogout({ revoked: true }));
  expect(screen.getByText('authenticated')).toBeVisible();
});

it('clears an expired session when explicitly refreshed', async () => {
  requests.getSession
    .mockResolvedValueOnce(session)
    .mockResolvedValueOnce(null);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('authenticated')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('anonymous')).toBeVisible();
});
