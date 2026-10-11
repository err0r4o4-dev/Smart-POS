import { beforeEach, expect, it, vi } from 'vitest';
import { responseStoreMode } from './store-mode';
import { organizationRequest } from './organization-api';
import { storefrontRequest } from './storefront-api';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

it('reads explicit store mode and preserves legacy header compatibility', () => {
  expect(
    responseStoreMode(new Headers({ 'X-SmartPOS-Store-Mode': 'single' })),
  ).toBe('single');
  expect(
    responseStoreMode(new Headers({ 'X-SmartPOS-Store-Mode': 'multi' })),
  ).toBe('multi');
  expect(responseStoreMode(new Headers())).toBe('multi');
  expect(() =>
    responseStoreMode(new Headers({ 'X-SmartPOS-Store-Mode': 'unknown' })),
  ).toThrow('ข้อมูลโหมดร้านไม่ถูกต้อง');
});
it('propagates header metadata through both real directory clients without changing data', async () => {
  const data = [{ name: 'ร้านทดสอบ' }];
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'X-SmartPOS-Store-Mode': 'single' }),
    json: async () => ({ data }),
  }));
  const onMode = vi.fn();
  expect(
    await organizationRequest('/organizations', { storeMode: onMode }),
  ).toEqual(data);
  expect(await storefrontRequest('', { storeMode: onMode })).toEqual(data);
  expect(onMode.mock.calls).toEqual([['single'], ['single']]);
});
it('rejects invalid directory mode before invoking the consumer', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'X-SmartPOS-Store-Mode': 'unknown' }),
    json: async () => ({ data: [] }),
  });
  const onMode = vi.fn();
  await expect(
    organizationRequest('/organizations', { storeMode: onMode }),
  ).rejects.toThrow('ข้อมูลโหมดร้านไม่ถูกต้อง');
  expect(onMode).not.toHaveBeenCalled();
});
