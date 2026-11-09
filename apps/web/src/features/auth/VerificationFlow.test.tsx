import { fireEvent, screen } from '@testing-library/react';
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import {
  captureVerificationLink,
  ResendVerification,
  VerificationFlow,
} from './VerificationFlow';

const requests = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  ...requests,
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows an explicit success confirmation after verification and session refresh', async () => {
  requests.verifyEmail.mockResolvedValue({
    verified: true,
    user: { id: 'one' },
  });
  render(
    <VerificationFlow
      token="secret"
      onComplete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await vi.waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(/email verified/i),
  );
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
    'href',
    '/login?verified=1&returnTo=%2Fsetup',
  );
  expect(
    screen.queryByRole('button', { name: /resend/i }),
  ).not.toBeInTheDocument();
});

it('waits before resending again without losing the email address', async () => {
  vi.useFakeTimers();
  requests.resendVerification.mockResolvedValue({ message: 'accepted' });
  render(<ResendVerification initialEmail="person@example.test" />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /resend verification/i }),
    );
  });
  expect(screen.getByRole('button', { name: /resend/i })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    /if an eligible account/i,
  );
  await act(async () => {
    vi.advanceTimersByTime(60_000);
  });
  expect(
    screen.getByRole('button', { name: /resend verification/i }),
  ).toBeEnabled();
  expect(screen.getByLabelText(/email address/i)).toHaveValue(
    'person@example.test',
  );
});

it('removes a query token immediately and preserves other location data', () => {
  window.history.replaceState(null, '', '/setup?verify=secret&other=1#section');
  expect(captureVerificationLink()).toBe('secret');
  expect(window.location.href).not.toContain('secret');
  expect(window.location.search).toBe('?other=1');
});

it('accepts the fragment form and removes it immediately', () => {
  window.history.replaceState(null, '', '/setup#verify=secret');
  expect(captureVerificationLink()).toBe('secret');
  expect(window.location.hash).toBe('');
});

it('verifies once and refreshes the session before continuing', async () => {
  requests.verifyEmail.mockResolvedValue({
    verified: true,
    user: { id: 'one' },
  });
  const complete = vi.fn().mockResolvedValue(undefined);
  render(<VerificationFlow token="secret" onComplete={complete} />);
  expect(screen.getByText(/verifying/i)).toBeVisible();
  await vi.waitFor(() => expect(complete).toHaveBeenCalledWith('one'));
  expect(requests.verifyEmail).toHaveBeenCalledTimes(1);
  expect(requests.verifyEmail).toHaveBeenCalledWith('secret');
});

it('shows an invalid link and lets the user request a replacement', async () => {
  requests.verifyEmail.mockRejectedValue(new Error('invalid'));
  requests.resendVerification.mockResolvedValue({
    message: 'If eligible, check your email.',
  });
  render(<VerificationFlow token="bad" onComplete={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /invalid or expired/i,
  );
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'person@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: /resend/i }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    /if an eligible account/i,
  );
  expect(requests.resendVerification).toHaveBeenCalledWith(
    'person@example.test',
  );
});

it('reports resend failure without claiming an email was sent', async () => {
  requests.verifyEmail.mockRejectedValue(new Error('unavailable'));
  requests.resendVerification.mockRejectedValue(new Error('unavailable'));
  render(<VerificationFlow token="bad" onComplete={vi.fn()} />);
  await screen.findByRole('alert');
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'person@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: /resend/i }));
  expect(await screen.findByText(/could not request/i)).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not claim verification when the response is not verified', async () => {
  requests.verifyEmail.mockResolvedValue({
    verified: false,
    user: { id: 'one' },
  });
  const complete = vi.fn();
  render(<VerificationFlow token="bad" onComplete={complete} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /could not be completed/i,
  );
  expect(complete).not.toHaveBeenCalled();
});

it('retries session refresh without consuming the token again', async () => {
  requests.verifyEmail.mockResolvedValue({
    verified: true,
    user: { id: 'one' },
  });
  const complete = vi
    .fn()
    .mockRejectedValueOnce(new Error('session unavailable'))
    .mockResolvedValueOnce(undefined);
  render(<VerificationFlow token="secret" onComplete={complete} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /session could not be refreshed/i,
  );
  fireEvent.click(screen.getByRole('button', { name: /retry session/i }));
  await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  expect(requests.verifyEmail).toHaveBeenCalledTimes(1);
});
