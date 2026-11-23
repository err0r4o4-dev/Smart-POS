import { afterEach, expect, it, vi } from 'vitest';
import { customerRequest } from './customers-api';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['GET', '/customers'],
  ['POST', '/customers/search'],
  ['GET', '/customers/customer-a'],
  ['GET', '/customers/groups'],
  ['GET', '/customers/customer-a/history'],
  ['GET', '/customers/customer-a/audit'],
  ['POST', '/customers'],
  ['PUT', '/customers/customer-a'],
  ['POST', '/customers/customer-a/archive'],
  ['POST', '/customers/groups'],
  ['PUT', '/customers/groups/group-a'],
  ['POST', '/customers/groups/group-a/archive'],
  ['PUT', '/customers/customer-a/groups/group-a'],
])('retains customer assurance errors on %s %s', async (method, path) => {
  const controller = new AbortController();
  for (const denial of [
    { status: 401, code: 'UNAUTHENTICATED' },
    { status: 403, code: 'MFA_REQUIRED' },
    { status: 403, code: 'FORBIDDEN' },
  ]) {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: denial.status,
      json: async () => ({
        error: { code: denial.code, message: 'Verify access' },
      }),
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      customerRequest('org-a', path, {
        method,
        signal: controller.signal,
        ...(method !== 'GET'
          ? { body: { search: 'Private' }, csrf: 'synthetic-csrf' }
          : {}),
      }),
    ).rejects.toMatchObject(denial);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/organizations/org-a${path}`,
      expect.objectContaining({
        method,
        credentials: 'same-origin',
        signal: controller.signal,
      }),
    );
    if (method !== 'GET') {
      expect(fetcher.mock.calls[0][0]).not.toContain('Private');
      expect(fetcher.mock.calls[0][1]).toMatchObject({
        body: '{"search":"Private"}',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
      });
    }
  }
});
