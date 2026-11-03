import { renderInEnglish as render } from '../../test/render';
import { fireEvent, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { LoginPage, ResetPasswordPage } from './AuthPages';

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  clear: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ clear: mocks.clear, signIn: mocks.signIn }),
}));
vi.mock('../../lib/api', () => ({
  resetPassword: mocks.resetPassword,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

it('places the store illustration before the login panel and preserves account links', () => {
  render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
  const introduction = screen.getByRole('region', {
    name: 'Run your store, simply.',
  });
  const loginPanel = screen.getByRole('region', { name: 'Welcome back.' });
  expect(
    within(introduction).getByRole('img', { name: /point-of-sale terminal/i }),
  ).toHaveAttribute('src', '/images/auth-pos-reference.png');
  expect(
    introduction.compareDocumentPosition(loginPanel) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(loginPanel).getByLabelText('Email address')).toHaveValue('');
  expect(within(loginPanel).getByLabelText('Password')).toHaveValue('');
  expect(
    within(loginPanel).getByRole('link', { name: 'Forgot password?' }),
  ).toHaveAttribute('href', '/forgot-password');
  expect(
    within(loginPanel).getByRole('link', { name: 'Create account' }),
  ).toHaveAttribute('href', '/register');
});

it('keeps password visibility and recoverable sign-in errors working in the redesigned card', async () => {
  mocks.signIn.mockRejectedValueOnce(new Error('Sign in unavailable'));
  render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'synthetic@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'synthetic-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Sign in unavailable',
  );
  expect(screen.getByLabelText('Email address')).toHaveValue(
    'synthetic@example.test',
  );
  expect(screen.getByLabelText('Password')).toHaveValue('synthetic-password');
  expect(mocks.signIn).toHaveBeenCalledWith(
    'synthetic@example.test',
    'synthetic-password',
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
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
