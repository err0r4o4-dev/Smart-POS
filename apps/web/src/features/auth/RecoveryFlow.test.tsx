import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { ForgotPasswordPage, ResetPasswordPage } from './AuthPages';
import { ApiError } from '../../lib/api';

const requests = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  ...requests,
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ clear: requests.clear }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
});

it('does not leave an earlier accepted reset message visible after a failed retry', async () => {
  requests.forgotPassword.mockResolvedValueOnce({
    message:
      'If an eligible account exists, check your email for reset instructions.',
  });
  requests.forgotPassword.mockRejectedValueOnce(
    new Error('Reset request unavailable'),
  );
  render(
    <BrowserRouter>
      <ForgotPasswordPage />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'person@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    /if an eligible account/i,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /check your connection/i,
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toHaveValue(
    'person@example.test',
  );
});

it('offers a replacement for an expired reset link without clearing the session', async () => {
  window.history.replaceState(null, '', '/reset-password?token=expired-token');
  requests.resetPassword.mockRejectedValue(
    new ApiError(400, 'Reset link is invalid or expired'),
  );
  render(
    <BrowserRouter>
      <ResetPasswordPage />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /invalid or expired/i,
  );
  expect(
    screen.getByRole('link', { name: 'Request a new reset link' }),
  ).toHaveAttribute('href', '/forgot-password');
  expect(requests.clear).not.toHaveBeenCalled();
  expect(window.location.href).not.toContain('expired-token');
});
