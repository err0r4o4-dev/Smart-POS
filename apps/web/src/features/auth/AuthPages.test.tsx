import { renderInEnglish as render } from '../../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './AuthPages';

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ clear: mocks.clear }),
}));
vi.mock('../../lib/api', () => ({
  resetPassword: mocks.resetPassword,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

it('removes the reset token from the URL before submission but retains it for the request', async () => {
  window.history.pushState(null, '', '/reset-password?token=secret-token');
  mocks.resetPassword.mockResolvedValue({ reset: true });
  render(
    <BrowserRouter>
      <ResetPasswordPage />
    </BrowserRouter>,
  );
  expect(window.location.href).not.toContain('secret-token');
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'a long valid password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'a long valid password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText(/Password changed/)).toBeVisible();
  expect(mocks.resetPassword).toHaveBeenCalledWith(
    'secret-token',
    'a long valid password',
  );
  expect(mocks.clear).toHaveBeenCalled();
});
