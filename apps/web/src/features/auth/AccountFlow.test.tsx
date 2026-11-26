import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { AuthProvider } from '../../app/AuthProvider';
import { RequireSession } from '../../app/ProtectedRoute';
import { LoginPage } from './AuthPages';
import type { AuthSession } from '../../lib/api';

const requests = vi.hoisted(() => ({
  getSession: vi.fn(),
  login: vi.fn(),
  getGoogleConfig: vi.fn(),
}));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  ...requests,
}));

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'person@example.test',
    display_name: 'Person',
    status: 'ACTIVE',
    email_verified: false,
    onboarding: 'PENDING_ORGANIZATION',
  },
  csrf_token: 'synthetic-csrf',
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  requests.getSession.mockResolvedValue(null);
  requests.getGoogleConfig.mockResolvedValue({ enabled: false });
});

function journey(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/verify-email"
            element={<h1>Awaiting verification</h1>}
          />
          <Route element={<RequireSession />}>
            <Route path="/workspace" element={<h1>Private workspace</h1>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('routes a valid unverified login to email verification instead of the workspace', async () => {
  requests.login.mockResolvedValue(session);
  journey();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: session.user.email },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'a-valid-long-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(
    await screen.findByRole('heading', { name: 'Awaiting verification' }),
  ).toBeVisible();
  expect(screen.queryByText('Private workspace')).not.toBeInTheDocument();
});

it('keeps an existing unverified session out of a direct private route', async () => {
  requests.getSession.mockResolvedValue(session);
  journey('/workspace');
  expect(
    await screen.findByRole('heading', { name: 'Awaiting verification' }),
  ).toBeVisible();
  expect(screen.queryByText('Private workspace')).not.toBeInTheDocument();
});

it('preserves workspace routing for verified logins', async () => {
  requests.login.mockResolvedValue({
    ...session,
    user: { ...session.user, email_verified: true },
  });
  journey();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: session.user.email },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'a-valid-long-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(
    await screen.findByRole('heading', { name: 'Private workspace' }),
  ).toBeVisible();
});
