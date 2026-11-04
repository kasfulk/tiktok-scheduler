import { BrowserError, captureBrowserSession } from '@tiktok-scheduler/browser';
import { encryptSecret, prisma } from '@tiktok-scheduler/db';
import { log } from '@tiktok-scheduler/shared';
import { ApiError, ok, route } from '@/lib/api';
import { accountToDto } from '@/lib/dto';

export const runtime = 'nodejs';

/** The shared capture throws BrowserError; the HTTP layer speaks ApiError. */
function toApiError(error: unknown): never {
  if (error instanceof BrowserError) throw new ApiError(502, error.code, error.message);
  throw error;
}

/**
 * Import a TikTok account from a browser the user logged into manually. The cookie jar is the
 * credential, so it is encrypted with the same key as OAuth tokens before it touches SQLite.
 */
export const POST = route(
  async ({ user }) => {
    const capture = await captureBrowserSession().catch(toApiError);
    const openId = `tt_${capture.profile.openId}`;

    const existing = await prisma.tikTokAccount.findUnique({ where: { openId }, select: { userId: true } });
    if (existing && existing.userId !== user.id) {
      throw new ApiError(409, 'ACCOUNT_TAKEN', 'This TikTok account is linked to another user');
    }

    const session = encryptSecret(JSON.stringify(capture.cookies));
    const fields = {
      username: capture.profile.username,
      displayName: capture.profile.displayName,
      avatarUrl: capture.profile.avatarUrl,
      authMode: 'BROWSER',
      browserSession: session,
      // No API token exists in this mode; the column stays empty instead of holding a fake one.
      accessToken: '',
      refreshToken: null,
      tokenExpiresAt: null,
      refreshExpiresAt: null,
      scopes: 'browser.session',
      connectionStatus: 'CONNECTED',
      lastSyncedAt: new Date(),
    };

    const isFirst = (await prisma.tikTokAccount.count({ where: { userId: user.id } })) === 0;
    const account = await prisma.tikTokAccount.upsert({
      where: { openId },
      create: { userId: user.id, openId, isDefault: isFirst, ...fields },
      update: fields,
      select: { id: true },
    });

    await prisma.accountPostingSettings.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, timezone: user.timezone },
      update: {},
    });
    if (isFirst) {
      await prisma.user.update({ where: { id: user.id }, data: { defaultAccountId: account.id } });
    }

    log('info', 'tiktok_browser_account_imported', { accountId: account.id, username: fields.username });
    return ok(accountToDto(await prisma.tikTokAccount.findUniqueOrThrow({ where: { id: account.id } })));
  },
  { rateLimit: 5 },
);
