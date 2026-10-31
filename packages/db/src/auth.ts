import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './client';

export const SESSION_COOKIE_NAME = 'tts_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  timezone: string;
  defaultAccountId: string | null;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  createdAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 60) ?? null,
    },
    select: { id: true },
  });
  return { token, expiresAt, sessionId: session.id };
}

/** Resolve a cookie token to a user; expired sessions are deleted on sight. */
export async function findSessionUser(token: string): Promise<SafeUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          timezone: true,
          defaultAccountId: true,
          telegramEnabled: true,
          telegramChatId: true,
          createdAt: true,
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return result.count;
}