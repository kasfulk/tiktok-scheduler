import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for TikTok access/refresh tokens. Payload layout:
 * `v1:<base64(iv | authTag | ciphertext)>`
 */
const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set (>= 16 characters) before storing tokens');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${VERSION}:${payload.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!isEncrypted(payload)) {
    throw new Error('Refusing to decrypt a value that is not in the encrypted token format');
  }
  const raw = Buffer.from(payload.slice(VERSION.length + 1), 'base64');
  if (raw.length <= IV_LENGTH + TAG_LENGTH) throw new Error('Encrypted payload is truncated');

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-2)}`;
}