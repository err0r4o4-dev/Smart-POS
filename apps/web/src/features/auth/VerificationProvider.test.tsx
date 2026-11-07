import { StrictMode } from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { AuthProvider } from '../../app/AuthProvider';

const requests = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  ...requests,
  ApiError: class extends Error {},
}));
vi.mock('./VerificationFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./VerificationFlow')>()),
  captureVerificationLink: () => 'verification-token',
}));

it('holds setup until a single verification and a refreshed matching session', async () => {
  let finish!: (value: unknown) => void;
  requests.verifyEmail.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  requests.getSession.mockResolvedValue({
    user: { id: 'verified-user', email_verified: true },
    csrf_token: 'csrf',
  });
  render(
    <StrictMode>
      <AuthProvider>
        <p>Setup content</p>
      </AuthProvider>
    </StrictMode>,
  );
  expect(screen.queryByText('Setup content')).not.toBeInTheDocument();
  expect(requests.verifyEmail).toHaveBeenCalledTimes(1);
  finish({ verified: true, user: { id: 'verified-user' } });
  expect(await screen.findByText('Setup content')).toBeVisible();
  expect(requests.getSession).toHaveBeenCalledTimes(1);
});
