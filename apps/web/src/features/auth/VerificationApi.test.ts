import { afterEach, expect, it, vi } from 'vitest';
import { resendVerification, verifyEmail } from '../../lib/api';

afterEach(() => vi.unstubAllGlobals());
it('posts verification and resend using same-origin JSON transport', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { verified: true } }),
  });
  vi.stubGlobal('fetch', fetcher);
  await verifyEmail('synthetic-token');
  await resendVerification('person@example.test');
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    '/api/v1/auth/email/verify',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ token: 'synthetic-token' }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    '/api/v1/auth/email/resend',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ email: 'person@example.test' }),
    }),
  );
});
