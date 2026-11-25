const ISSUER = 'VELO';

/**
 * Builds the standard Key URI used by authenticator apps. Parameters match the
 * server TOTP verifier (HMAC-SHA1, six digits, 30-second steps). The URI holds
 * the shared secret, so it must only be rendered locally and never sent to a
 * third-party QR service, logged or stored.
 */
export function otpauthUri(secret: string, account: string): string {
  const label = `${ISSUER}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30`;
}
