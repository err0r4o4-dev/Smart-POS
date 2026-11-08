import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { LoginPage, RegisterPage } from './AuthPages';

const mocks = vi.hoisted(() => ({
  getGoogleConfig: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogleLink: vi.fn(),
}));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => mocks }));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  getGoogleConfig: mocks.getGoogleConfig,
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/login');
  mocks.getGoogleConfig.mockResolvedValue({ enabled: true });
});

it('places Google below the email submit button and separator', async () => {
  render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
  const google = await screen.findByRole('button', {
    name: 'Sign in with Google',
  });
  expect(google).toBeEnabled();
  const submit = screen.getByRole('button', { name: 'Sign in' });
  expect(
    submit.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText('or')).toBeVisible();
});

it('disables unconfigured Google without disabling email signup', async () => {
  mocks.getGoogleConfig.mockResolvedValue({ enabled: false });
  render(
    <BrowserRouter>
      <RegisterPage />
    </BrowserRouter>,
  );
  expect(
    await screen.findByText(/Google sign-in is not available/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Sign up with Google' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
});

it('lets availability checks recover', async () => {
  mocks.getGoogleConfig.mockRejectedValueOnce(new Error('offline'));
  render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
  expect(
    await screen.findByRole('button', { name: 'Sign in with Google' }),
  ).toBeEnabled();
  expect(mocks.getGoogleConfig).toHaveBeenCalledTimes(2);
});

it('requires password confirmation to link a pending Google account', async () => {
  window.history.replaceState(null, '', '/login?google=link_required');
  mocks.signInWithGoogleLink.mockRejectedValueOnce(
    new Error('Confirm your credentials'),
  );
  render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
  expect(screen.getByText(/Confirm your existing account email/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'person@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'long-existing-password' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm account and link Google' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Confirm your credentials',
  );
  expect(mocks.signInWithGoogleLink).toHaveBeenCalledWith(
    'person@example.test',
    'long-existing-password',
  );
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Sign in with Google' }),
  ).toBeNull();
});
