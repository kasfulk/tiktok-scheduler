import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_NONCE_COOKIE = 'tts_oauth_nonce';
const MAX_AGE_MS = 10 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) throw new Error('AUTH_SECRET must be set before starting the OAuth flow');
  return value;
}

function sign(nonce: string, issuedAt: number): string {
  return createHmac('sha256', secret()).update(`${nonce}.${issuedAt}`).digest('base64url');
}

export function createOAuthState(): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const issuedAt = Date.now();
  return { state: `${nonce}.${issuedAt}.${sign(nonce, issuedAt)}`, nonce };
}

/** Verify signature, freshness and that the state matches the nonce bound to this browser. */
export function verifyOAuthState(state: string, expectedNonce: string | undefined): boolean {
  if (!state || !expectedNonce) return false;
  const [nonce, issuedAtRaw, signature] = state.split('.');
  if (!nonce || !issuedAtRaw || !signature) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) return false;
  if (nonce !== expectedNonce) return false;

  const expected = Buffer.from(sign(nonce, issuedAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}