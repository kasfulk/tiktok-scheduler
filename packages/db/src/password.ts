import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

/** scrypt parameters. 128 * N * r = 16 MiB of memory per hash. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

function derive(password: string, salt: Buffer, length: number, n: number, r: number, p: number): Promise<Buffer> {
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
  scryptCallback(password.normalize('NFKC'), salt, length, { N: n, r, p, maxmem: 128 * n * r * 2 }, (error, key) => {
    if (error) reject(error);
    else resolve(key);
  });
  return promise;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, N, R, P);
  return [PREFIX, N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;
  const [, rawN, rawR, rawP, saltB64, keyB64] = parts;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 1024 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 4) return false;

  const salt = Buffer.from(saltB64 ?? '', 'base64');
  const expected = Buffer.from(keyB64 ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await derive(password, salt, expected.length, n, r, p);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}