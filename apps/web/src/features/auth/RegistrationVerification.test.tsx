import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { RegisterPage } from './AuthPages';

const api = vi.hoisted(() => ({
  getGoogleConfig: vi.fn().mockResolvedValue({ enabled: false }),
  register: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ ...api }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('offers verification recovery without repeating an uncertain registration', () => {
  render(
    <BrowserRouter>
      <RegisterPage />
    </BrowserRouter>,
  );
  expect(
    screen.getByRole('link', { name: /already registered.*verification/i }),
  ).toHaveAttribute('href', '/verify-email');
});

async function createAccount() {
  render(
    <BrowserRouter>
      <RegisterPage />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText('Display name'), {
    target: { value: 'Person' },
  });
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'person@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { name: /verify your email/i });
}

it('keeps the committed account recoverable when the verification email was not accepted', async () => {
  api.register.mockResolvedValue({
    email_verified: false,
    verification_email_sent: false,
  });
  await createAccount();
  expect(screen.getByRole('alert')).toHaveTextContent(
    /account was created.*could not send/i,
  );
  expect(
    screen.getByRole('button', { name: /resend verification/i }),
  ).toBeEnabled();
  expect(api.register).toHaveBeenCalledTimes(1);
});

it('shows verification instructions and allows resend after registration', async () => {
  api.register.mockResolvedValue({ email_verified: false });
  api.resendVerification.mockResolvedValue({ message: 'accepted' });
  render(
    <BrowserRouter>
      <RegisterPage />
    </BrowserRouter>,
  );
  fireEvent.change(screen.getByLabelText('Display name'), {
    target: { value: 'Person' },
  });
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'person@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'long-valid-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(
    await screen.findByRole('heading', { name: /verify your email/i }),
  ).toBeVisible();
  expect(screen.getByLabelText('Email address')).toHaveValue(
    'person@example.test',
  );
  fireEvent.click(screen.getByRole('button', { name: /resend verification/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    /if an eligible account/i,
  );
});
