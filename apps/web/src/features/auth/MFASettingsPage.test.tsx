import { act, fireEvent, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useReducer } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish as render } from '../../test/render';
import { MFASettingsPage } from './MFASettingsPage';
import { ApiError } from '../../lib/api';

const mocks = vi.hoisted(() => ({
  auth: {
    clear: vi.fn(),
    state: {
      status: 'authenticated',
      session: { user: { id: 'one' }, csrf_token: 'session-one' },
    },
  },
  getMFAStatus: vi.fn(),
  beginMFAEnrollment: vi.fn(),
  confirmMFAEnrollment: vi.fn(),
  verifyMFA: vi.fn(),
}));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('./mfa-api', () => mocks);

const codes = Array.from({ length: 10 }, (_, i) => `${'A'.repeat(25)}${i}`);
const enrollment = {
  factor_id: 'factor',
  secret: 'A'.repeat(32),
  expires_at: '2026-11-22T12:05:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.state.session = { user: { id: 'one' }, csrf_token: 'session-one' };
  mocks.getMFAStatus.mockResolvedValue({
    enabled: false,
    session_verified: false,
  });
  mocks.beginMFAEnrollment.mockResolvedValue(enrollment);
  mocks.confirmMFAEnrollment.mockResolvedValue({ recovery_codes: codes });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function page() {
  let redraw!: () => void;
  function Harness() {
    const [, update] = useReducer((value) => value + 1, 0);
    redraw = update;
    return <MFASettingsPage />;
  }
  const router = createMemoryRouter(
    [
      { path: '/security', element: <Harness /> },
      { path: '/workspace', element: <h1>Workspace</h1> },
    ],
    { initialEntries: ['/security'] },
  );
  return {
    router,
    redraw: () => redraw(),
    ...render(<RouterProvider router={router} />),
  };
}

async function enroll() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Set up authenticator' }),
  );
  expect(await screen.findByLabelText('Authenticator setup key')).toHaveValue(
    enrollment.secret,
  );
  fireEvent.change(screen.getByLabelText('Six-digit code'), {
    target: { value: '001234' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Enable MFA' }).closest('form')!,
  );
}

it('uses real API boundaries and retains one-time codes until explicit acknowledgement', async () => {
  const { router } = page();
  await enroll();
  expect(await screen.findByText(codes[0])).toBeVisible();
  expect(mocks.confirmMFAEnrollment).toHaveBeenCalledWith(
    '001234',
    'session-one',
    expect.any(AbortSignal),
  );
  expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  await act(() => router.navigate('/workspace'));
  expect(
    await screen.findByText('Keep your recovery codes before leaving'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(screen.getByText(codes[0])).toBeVisible();
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have stored these codes somewhere safe',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByText(codes[0])).toBeNull();
  expect(await screen.findByText('MFA is enabled')).toBeVisible();
  expect(localStorage.getItem('mfa')).toBeNull();
});

it('keeps loading and dependency failure recoverable without automatic mutation', async () => {
  const pending = deferred<{ enabled: boolean; session_verified: boolean }>();
  mocks.getMFAStatus.mockReturnValueOnce(pending.promise);
  page();
  expect(screen.getByText('Checking MFA…')).toBeVisible();
  await act(() => pending.resolve({ enabled: false, session_verified: false }));
  expect(
    await screen.findByRole('button', { name: 'Set up authenticator' }),
  ).toBeEnabled();
  expect(mocks.beginMFAEnrollment).not.toHaveBeenCalled();
});

it('recovers status failure and does not render raw server errors', async () => {
  mocks.getMFAStatus.mockRejectedValueOnce(new Error('private-response'));
  page();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check status again' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Set up authenticator' }),
  ).toBeEnabled();
  expect(screen.queryByText('private-response')).toBeNull();
});

it('prevents duplicate enrollment and ignores the result after a session change', async () => {
  const pending = deferred<typeof enrollment>();
  mocks.beginMFAEnrollment.mockReturnValueOnce(pending.promise);
  const view = page();
  const begin = await screen.findByRole('button', {
    name: 'Set up authenticator',
  });
  fireEvent.click(begin);
  fireEvent.click(begin);
  expect(mocks.beginMFAEnrollment).toHaveBeenCalledTimes(1);
  const signal = mocks.beginMFAEnrollment.mock.calls[0][1] as AbortSignal;
  mocks.auth.state.session = { user: { id: 'two' }, csrf_token: 'session-two' };
  act(view.redraw);
  expect(signal.aborted).toBe(true);
  await act(() => pending.resolve(enrollment));
  expect(
    await screen.findByRole('button', { name: 'Set up authenticator' }),
  ).toBeEnabled();
  expect(screen.queryByLabelText('Authenticator setup key')).toBeNull();
});

it('retains the lost-confirmation warning after status says enabled', async () => {
  mocks.confirmMFAEnrollment.mockRejectedValueOnce(
    new Error('connection lost'),
  );
  page();
  await enroll();
  const check = await screen.findByRole('button', {
    name: 'Check status again',
  });
  expect(mocks.confirmMFAEnrollment).toHaveBeenCalledTimes(1);
  mocks.getMFAStatus.mockResolvedValue({
    enabled: true,
    session_verified: true,
  });
  fireEvent.click(check);
  expect(await screen.findByText('MFA is enabled')).toBeVisible();
  expect(
    screen.getByText(
      /Code regeneration and administrator recovery are not available yet/,
    ),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Enable MFA' })).toBeNull();
});

it('preserves a correctable proof error and offers a primary sign-in escape', async () => {
  mocks.confirmMFAEnrollment.mockRejectedValueOnce(
    new ApiError(400, 'private-proof'),
  );
  page();
  await enroll();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'invalid or expired',
  );
  expect(screen.getByLabelText('Six-digit code')).toHaveValue('001234');
  expect(screen.getByLabelText('Authenticator setup key')).toHaveValue(
    enrollment.secret,
  );
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
    'href',
    '/login',
  );
  expect(screen.queryByText('private-proof')).toBeNull();
});

it('validates literal six-digit strings and verifies an enabled factor', async () => {
  mocks.getMFAStatus.mockResolvedValue({
    enabled: true,
    session_verified: false,
  });
  mocks.verifyMFA.mockResolvedValue({ session_verified: true });
  page();
  const input = await screen.findByLabelText('Six-digit code');
  const form = input.closest('form')!;
  fireEvent.change(input, { target: { value: '123' } });
  fireEvent.submit(form);
  expect(mocks.verifyMFA).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '001234' } });
  fireEvent.submit(form);
  expect(
    await screen.findByText('MFA verified for this session'),
  ).toBeVisible();
  expect(mocks.verifyMFA).toHaveBeenCalledWith(
    '001234',
    'session-one',
    expect.any(AbortSignal),
  );
});

it('clears displayed secrets when proof is denied for the session', async () => {
  mocks.confirmMFAEnrollment.mockRejectedValueOnce(
    new ApiError(401, 'expired'),
  );
  page();
  await enroll();
  await screen.findByRole('link', { name: 'Sign in again' });
  await vi.waitFor(() => expect(mocks.auth.clear).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText('Authenticator setup key')).toBeNull();
  expect(screen.queryByLabelText('Six-digit code')).toBeNull();
});

it('guards reload and allows an explicit decision to leave one-time codes', async () => {
  const { router } = page();
  await enroll();
  await screen.findByText(codes[0]);
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(() => router.navigate('/workspace'));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Leave and clear displayed codes',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Workspace' }),
  ).toBeVisible();
  expect(screen.queryByText(codes[0])).toBeNull();
});

it('clears one-time codes when the authenticated session changes', async () => {
  const view = page();
  await enroll();
  await screen.findByText(codes[0]);
  mocks.auth.state.session = { user: { id: 'one' }, csrf_token: 'session-new' };
  act(view.redraw);
  expect(screen.queryByText(codes[0])).toBeNull();
  expect(
    await screen.findByRole('button', { name: 'Set up authenticator' }),
  ).toBeEnabled();
});

it('warns before abandoning pending confirmation and retains its eventual codes', async () => {
  const pending = deferred<{ recovery_codes: string[] }>();
  mocks.confirmMFAEnrollment.mockReturnValueOnce(pending.promise);
  const { router } = page();
  await enroll();
  await act(() => router.navigate('/workspace'));
  expect(
    await screen.findByText('Confirmation may still complete'),
  ).toBeVisible();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(router.state.location.pathname).toBe('/security');
  await act(() => pending.resolve({ recovery_codes: codes }));
  expect(await screen.findByText(codes[0])).toBeVisible();
  expect(
    screen.getByText(/Using recovery codes is not available yet/),
  ).toBeVisible();
});

it('removes the pending navigation warning after a rejected confirmation', async () => {
  const pending = deferred<{ recovery_codes: string[] }>();
  mocks.confirmMFAEnrollment.mockReturnValueOnce(pending.promise);
  const { router } = page();
  await enroll();
  await act(() => router.navigate('/workspace'));
  expect(
    await screen.findByText('Confirmation may still complete'),
  ).toBeVisible();
  await act(() => pending.reject(new ApiError(400, 'invalid')));
  expect(screen.queryByText('Confirmation may still complete')).toBeNull();
  expect(router.state.location.pathname).toBe('/security');
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
  await act(() => router.navigate('/workspace'));
  expect(
    await screen.findByRole('heading', { name: 'Workspace' }),
  ).toBeVisible();
});

it('aborts a pending confirmation only after an explicit decision to leave', async () => {
  const pending = deferred<{ recovery_codes: string[] }>();
  mocks.confirmMFAEnrollment.mockReturnValueOnce(pending.promise);
  const { router } = page();
  await enroll();
  const signal = mocks.confirmMFAEnrollment.mock.calls[0][2] as AbortSignal;
  await act(() => router.navigate('/workspace'));
  expect(signal.aborted).toBe(false);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Leave this page' }),
  );
  expect(signal.aborted).toBe(true);
  await act(() => pending.resolve({ recovery_codes: codes }));
  expect(
    await screen.findByRole('heading', { name: 'Workspace' }),
  ).toBeVisible();
  expect(screen.queryByText(codes[0])).toBeNull();
});
