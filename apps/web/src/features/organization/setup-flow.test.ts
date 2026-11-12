import { describe, expect, it, vi } from 'vitest';
import {
  setupScreenForStep,
  saveSetupSections,
  seedSavedSetupSection,
  type SetupSaveCache,
} from './setup-flow';

describe('four-step setup', () => {
  it('does not rewrite hydrated saved tables until their payload changes', async () => {
    const cache: SetupSaveCache = {};
    const payload = { qr_enabled: true, tables: [{ name: 'One' }] };
    seedSavedSetupSection(cache, 'tables', payload);
    const write = vi.fn().mockResolvedValue(undefined);
    await saveSetupSections(
      [{ key: 'tables', payload }],
      cache,
      () => 'new-key',
      write,
    );
    expect(write).not.toHaveBeenCalled();
    await saveSetupSections(
      [{ key: 'tables', payload: { ...payload, qr_enabled: false } }],
      cache,
      () => 'new-key',
      write,
    );
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('maps legacy progress without skipping the unconfirmed location', () => {
    expect(setupScreenForStep('tables', false)).toBe(0);
    expect(setupScreenForStep('orders', false)).toBe(0);
    expect(setupScreenForStep('menu', false)).toBe(1);
    expect(setupScreenForStep('payments', true)).toBe(2);
    expect(setupScreenForStep('review', true)).toBe(3);
  });

  it('retries only the failed section with its original key after partial success', async () => {
    const cache: SetupSaveCache = {};
    const entries = [
      { key: 'tables', payload: { name: 'One' } },
      { key: 'orders', payload: { qr: true } },
    ];
    const write = vi
      .fn()
      .mockResolvedValueOnce('tables saved')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('orders saved');
    let nextKey = 0;
    const createKey = () => `key-${++nextKey}`;
    await expect(
      saveSetupSections(entries, cache, createKey, write),
    ).rejects.toThrow('offline');
    await saveSetupSections(entries, cache, createKey, write);
    expect(write.mock.calls.map(([entry, key]) => [entry.key, key])).toEqual([
      ['tables', 'key-1'],
      ['orders', 'key-2'],
      ['orders', 'key-2'],
    ]);
    await saveSetupSections(entries, cache, createKey, write);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('uses a new key only when that section payload changes', async () => {
    const cache: SetupSaveCache = {};
    const write = vi.fn().mockResolvedValue(undefined);
    let nextKey = 0;
    await saveSetupSections(
      [{ key: 'menu', payload: { price: '10' } }],
      cache,
      () => String(++nextKey),
      write,
    );
    await saveSetupSections(
      [{ key: 'menu', payload: { price: '20' } }],
      cache,
      () => String(++nextKey),
      write,
    );
    expect(write.mock.calls.map(([, key]) => key)).toEqual(['1', '2']);
  });
});
