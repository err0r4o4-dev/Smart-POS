import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { AuthProvider } from '../../app/AuthProvider';
import { EmailVerificationPage } from './EmailVerificationPage';

const requests = vi.hoisted(() => ({
  getSession: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  ...requests,
}));
const session = {
  user: { id: 'one', email: 'person@example.test', email_verified: false },
  csrf_token: 'synthetic',
};

beforeEach(() => {
  vi.resetAllMocks();
  requests.getSession.mockResolvedValue(session);
});

function page() {
  render(
    <MemoryRouter initialEntries={['/verify-email']}>
      <AuthProvider>
        <Routes>
          <Route path="/verify-email" element={<EmailVerificationPage />} />
          <Route path="/workspace" element={<h1>Verified workspace</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('shows the signed-in email and checks again after verification in another tab', async () => {
  page();
  expect(await screen.findByLabelText('Email address')).toHaveValue(
    'person@example.test',
  );
  requests.getSession.mockResolvedValue({
    ...session,
    user: { ...session.user, email_verified: true },
  });
  fireEvent.click(screen.getByRole('button', { name: /check again/i }));
  expect(
    await screen.findByRole('heading', { name: 'Verified workspace' }),
  ).toBeVisible();
});

it('offers session retry instead of falsely claiming verification after a lookup failure', async () => {
  requests.getSession
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce(session);
  page();
  expect(await screen.findByRole('alert')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(await screen.findByLabelText('Email address')).toHaveValue(
    'person@example.test',
  );
  expect(screen.queryByText('Verified workspace')).not.toBeInTheDocument();
});

it('allows anonymous users to request a link without exposing or inventing a session', async () => {
  requests.getSession.mockResolvedValue(null);
  page();
  expect(await screen.findByLabelText('Email address')).toHaveValue('');
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
    'href',
    '/login?returnTo=%2Fsetup',
  );
  expect(
    screen.queryByRole('button', { name: /check again/i }),
  ).not.toBeInTheDocument();
});
