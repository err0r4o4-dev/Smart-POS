import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { resendVerification } from '../../lib/api';
import { ResendVerification } from './VerificationFlow';
import Swal from 'sweetalert2';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('keeps an accepted result even when the notification renderer fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { message: 'accepted' } }), {
        status: 202,
      }),
    ),
  );
  vi.spyOn(Swal, 'fire').mockImplementationOnce(() => {
    throw new Error('renderer unavailable');
  });
  render(<ResendVerification initialEmail="person@example.test" />);
  await act(async () => {
    fireEvent.submit(
      screen.getByRole('button', { name: /resend/i }).closest('form')!,
    );
  });
  expect(screen.getByText(/if an eligible account/i)).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves rate-limit wait metadata, including on a non-JSON response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('busy', {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }),
    ),
  );
  await expect(resendVerification('person@example.test')).rejects.toMatchObject(
    {
      status: 429,
      retryAfterSeconds: 3600,
    },
  );
});

it.each([
  ['Tue, 10 Nov 2026 00:01:30 GMT', 90],
  ['Mon, 09 Nov 2026 23:59:00 GMT', 0],
  ['invalid', undefined],
  ['1.5', undefined],
  ['-20', undefined],
  ['', undefined],
])('parses Retry-After %s without guessing a wait', async (header, seconds) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T00:00:00Z'));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: {} }), {
        status: 429,
        headers: { 'Retry-After': header },
      }),
    ),
  );
  await expect(resendVerification('person@example.test')).rejects.toMatchObject(
    {
      status: 429,
      retryAfterSeconds: seconds,
    },
  );
});

it('blocks duplicate submissions while the first request is pending', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<ResendVerification initialEmail="person@example.test" />);
  const form = screen.getByRole('button', { name: /resend/i }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () =>
    finish(
      new Response(JSON.stringify({ data: { message: 'accepted' } }), {
        status: 202,
      }),
    ),
  );
  await vi.waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      /if an eligible account/i,
    ),
  );
});

it('explains a server-directed hour wait, counts down and never auto-resends', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { message: '<b>private server detail</b>' },
      }),
      { status: 429, headers: { 'Retry-After': '3600' } },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<ResendVerification initialEmail="person@example.test" />);
  await act(async () => {
    fireEvent.submit(
      screen.getByRole('button', { name: /resend/i }).closest('form')!,
    );
  });
  expect(screen.getByRole('alert')).toHaveTextContent(/too many requests/i);
  expect(screen.getByRole('button', { name: /60:00/ })).toBeDisabled();
  expect(screen.queryByText(/private server detail/)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3_600_000));
  expect(
    screen.getByRole('button', { name: /resend verification email/i }),
  ).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
