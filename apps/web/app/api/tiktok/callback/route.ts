import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { encryptSecret, prisma } from '@tiktok-scheduler/db';
import { log } from '@tiktok-scheduler/shared';
import { route } from '@/lib/api';
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from '@/lib/oauth-state';
import { appUrl, assertLiveCredentials, tiktokClient, tiktokMode } from '@/lib/tiktok';

export const runtime = 'nodejs';

/**
 * OAuth callback. The session cookie must still be present, the signed `state` must match the
 * nonce bound to this browser, and tokens are encrypted before they touch SQLite.
 */
export const GET = route(async ({ request, user }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const errorParam = url.searchParams.get('error');
  const store = await cookies();
  const nonce = store.get(OAUTH_NONCE_COOKIE)?.value;
  store.delete(OAUTH_NONCE_COOKIE);

  if (errorParam) {
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent(url.searchParams.get('error_description') ?? errorParam)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent('Authorization code missing')}`);
  }
  if (!verifyOAuthState(state, nonce)) {
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent('Invalid or expired OAuth state')}`);
  }

  const mode = tiktokMode();
  assertLiveCredentials();
  const client = tiktokClient();

  try {
    const tokens =
      mode === 'mock'
        ? {
            accessToken: `mock-access-${createHash('sha256').update(code).digest('hex').slice(0, 24)}`,
            refreshToken: `mock-refresh-${createHash('sha256').update(`r:${code}`).digest('hex').slice(0, 24)}`,
            openId: `mock_${createHash('sha256').update(nonce ?? code).digest('hex').slice(0, 16)}`,
            expiresIn: 86_400,
            refreshExpiresIn: 365 * 86_400,
            scope: 'user.info.basic,video.publish,video.upload',
            tokenType: 'Bearer',
          }
        : await client.exchangeAuthorizationCode(code);

    const profile =
      mode === 'mock'
        ? { openId: tokens.openId, username: 'mock_creator', displayName: 'Mock Creator', avatarUrl: null }
        : await client.fetchUserProfile(tokens.accessToken);

    const existing = await prisma.tikTokAccount.findUnique({
      where: { openId: tokens.openId },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent('This TikTok account is linked to another user')}`);
    }

    const hasAccounts = await prisma.tikTokAccount.count({ where: { userId: user.id } });

    const account = await prisma.tikTokAccount.upsert({
      where: { openId: tokens.openId },
      create: {
        userId: user.id,
        openId: tokens.openId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        refreshExpiresAt: tokens.refreshExpiresIn ? new Date(Date.now() + tokens.refreshExpiresIn * 1000) : null,
        scopes: tokens.scope,
        connectionStatus: 'CONNECTED',
        isDefault: hasAccounts === 0,
        lastSyncedAt: new Date(),
      },
      update: {
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        refreshExpiresAt: tokens.refreshExpiresIn ? new Date(Date.now() + tokens.refreshExpiresIn * 1000) : null,
        scopes: tokens.scope,
        connectionStatus: 'CONNECTED',
        lastSyncedAt: new Date(),
      },
      select: { id: true, isDefault: true },
    });

    await prisma.accountPostingSettings.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, timezone: user.timezone },
      update: {},
    });

    if (account.isDefault) {
      await prisma.user.update({ where: { id: user.id }, data: { defaultAccountId: account.id } });
    }

    return NextResponse.redirect(`${appUrl()}/accounts?connected=1`);
  } catch (error) {
    log('error', 'tiktok_oauth_failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(
      `${appUrl()}/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : 'TikTok connection failed')}`,
    );
  }
});