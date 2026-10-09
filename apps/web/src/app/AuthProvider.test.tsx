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
  const { state, signIn, signOut, clear } = useAuth();
  return (
    <div>
      <output>{state.status}</output>
      <button onClick={() => void signIn('person@example.test', 'password')}>
        Sign in
      </button>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={clear}>Clear</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
