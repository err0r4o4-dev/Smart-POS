import { afterEach, expect, it, vi } from 'vitest';
import { getReadiness } from './api';

afterEach(() => vi.unstubAllGlobals());
it('accepts actual readiness', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ready' }) }),
  );
  await expect(getReadiness()).resolves.toEqual({ status: 'ready' });
});
it('does not replace dependency failures with demo success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(getReadiness()).rejects.toThrow('unavailable');
});
it('rejects malformed readiness', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'unknown' }),
    }),
  );
  await expect(getReadiness()).rejects.toThrow('unexpected');
});
