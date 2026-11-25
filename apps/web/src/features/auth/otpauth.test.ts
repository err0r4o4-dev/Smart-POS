import { expect, it } from 'vitest';
import { otpauthUri } from './otpauth';

it('builds a standard TOTP provisioning URI matching the server algorithm', () => {
  expect(otpauthUri('A'.repeat(32), 'owner@example.test')).toBe(
    `otpauth://totp/VELO:owner%40example.test?secret=${'A'.repeat(32)}&issuer=VELO&algorithm=SHA1&digits=6&period=30`,
  );
});

it('encodes account labels that contain separators', () => {
  expect(otpauthUri('B'.repeat(32), 'a:b c?d')).toContain(
    'VELO:a%3Ab%20c%3Fd?',
  );
});
