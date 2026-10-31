import { decryptSecret, encryptSecret, prisma, SchedulingError } from '@tiktok-scheduler/db';
import type { TikTokClient } from '@tiktok-scheduler/tiktok';
import { acquireLock, createRedisConnection } from '@tiktok-scheduler/queue';
import { tiktokMode } from './config.js';

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

interface AccountTokens {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

function readTokens(account: AccountTokens): { accessToken: string; refreshToken: string | null } {
  return {
    accessToken: decryptSecret(account.accessToken),
    refreshToken: account.refreshToken ? decryptSecret(account.refreshToken) : null,
  };
}

/**
 * Return a usable access token, refreshing under a per-account Redis lease so two jobs cannot
 * invalidate each other's tokens. Throws when the account must be reconnected.
 */
export async function ensureAccessToken(
  account: AccountTokens,
  client: TikTokClient,
): Promise<string> {
  const tokens = readTokens(account);
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > REFRESH_WINDOW_MS) return tokens.accessToken;

  const release = await acquireLock(`tiktok-refresh:${account.id}`, 60_000);
  if (!release) {
    // Another worker is refreshing; wait briefly and re-read the row.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const refreshed = await prisma.tikTokAccount.findUnique({
      where: { id: account.id },
      select: { accessToken: true, tokenExpiresAt: true },
    });
    if (refreshed && (refreshed.tokenExpiresAt?.getTime() ?? 0) - Date.now() > REFRESH_WINDOW_MS) {
      return decryptSecret(refreshed.accessToken);
    }
    throw new SchedulingError('TOKEN_REFRESH_BUSY', 'Token refresh is held by another worker');
  }

  try {
    if (tiktokMode() === 'mock') {
      const extended = new Date(Date.now() + 24 * 3600 * 1000);
      await prisma.tikTokAccount.update({
        where: { id: account.id },
        data: { tokenExpiresAt: extended, connectionStatus: 'CONNECTED' },
      });
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      await markExpired(account.id);
      throw new SchedulingError('TOKEN_EXPIRED', 'TikTok refresh token is missing; reconnect the account');
    }

    const refreshed = await client.refreshAccessToken(tokens.refreshToken);
    await prisma.tikTokAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptSecret(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        connectionStatus: 'CONNECTED',
        lastSyncedAt: new Date(),
      },
    });
    return refreshed.accessToken;
  } catch (error) {
    await markExpired(account.id);
    throw error;
  } finally {
    await release();
  }
}

async function markExpired(accountId: string): Promise<void> {
  await prisma.tikTokAccount
    .update({ where: { id: accountId }, data: { connectionStatus: 'EXPIRED' } })
    .catch(() => undefined);
}

export function oauthLockConnection() {
  return createRedisConnection('locks');
}