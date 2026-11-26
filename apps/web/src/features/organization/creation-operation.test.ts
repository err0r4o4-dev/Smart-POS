import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CreationRecoveryError,
  finishCreation,
  reserveCreationKey,
} from './creation-operation';

const first = 'a1000000-0000-4000-8000-000000000001';
const second = 'a1000000-0000-4000-8000-000000000002';
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it('recovers the same operation after remount without storing shop details', async () => {
  const payload = JSON.stringify({
    name: 'Private shop',
    address: 'Private address',
  });
  await expect(reserveCreationKey('owner', payload, () => first)).resolves.toBe(
    first,
  );
  await expect(
    reserveCreationKey('owner', payload, () => second),
  ).resolves.toBe(first);
  expect(JSON.stringify(sessionStorage)).not.toContain('Private');
});

it('blocks changed details while a prior creation result remains unknown', async () => {
  await reserveCreationKey('owner', 'original', () => first);
  await expect(
    reserveCreationKey('owner', 'changed', () => second),
  ).rejects.toMatchObject({ reason: 'changed' });
  await expect(
    reserveCreationKey('owner', 'original', () => second),
  ).resolves.toBe(first);
});

it('scopes operations to the actor and clears only the confirmed matching operation', async () => {
  await reserveCreationKey('owner', 'original', () => first);
  await expect(
    reserveCreationKey('other', 'original', () => second),
  ).resolves.toBe(second);
  finishCreation('owner', second);
  await expect(
    reserveCreationKey('owner', 'original', () => second),
  ).resolves.toBe(first);
  finishCreation('owner', first);
  await expect(
    reserveCreationKey('owner', 'changed', () => second),
  ).resolves.toBe(second);
});

it('fails before submission when recovery storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  await expect(
    reserveCreationKey('owner', 'original', () => first),
  ).rejects.toBeInstanceOf(CreationRecoveryError);
});
