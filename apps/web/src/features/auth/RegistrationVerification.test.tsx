import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { RegisterPage } from './AuthPages';

const api = vi.hoisted(() => ({
  getGoogleConfig: vi.fn().mockResolvedValue({ enabled: false }),
  register: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ ...api }));

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
