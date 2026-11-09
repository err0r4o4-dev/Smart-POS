import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { resendVerification } from '../../lib/api';
import { ResendVerification } from './VerificationFlow';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('preserves rate-limit wait metadata, including on a non-JSON response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', {
    status: 429, headers: { 'Retry-After': '3600' },
  })));
  await expect(resendVerification('person@example.test')).rejects.toMatchObject({
    status: 429, retryAfterSeconds: 3600,
  });
});

it('explains a server-directed hour wait, counts down and never auto-resends', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { message: '<b>private server detail</b>' },
  }), { status: 429, headers: { 'Retry-After': '3600' } }));
  vi.stubGlobal('fetch', fetcher);
  render(<ResendVerification initialEmail="person@example.test" />);
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: /resend/i }).closest('form')!);
  });
  expect(screen.getByRole('alert')).toHaveTextContent(/too many requests/i);
  expect(screen.getByRole('button', { name: /60:00/ })).toBeDisabled();
  expect(screen.queryByText(/private server detail/)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3_600_000));
  expect(screen.getByRole('button', { name: /resend verification email/i })).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
