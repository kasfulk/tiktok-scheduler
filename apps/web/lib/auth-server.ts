import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSession,
  findSessionUser,
  revokeSession,
  type SafeUser,
} from '@tiktok-scheduler/db';
import { cookieSecure } from '@/lib/utils';

export async function getSessionUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionUser(token);
}

export async function startSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const { token, expiresAt, sessionId } = await createSession(userId, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    expires: expiresAt,
  });
  return { sessionId, expiresAt };
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await revokeSession(token);
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: 0,
  });
}

export { SESSION_COOKIE_NAME, SESSION_TTL_MS };