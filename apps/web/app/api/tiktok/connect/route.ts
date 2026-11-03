import { cookies } from 'next/headers';
import { ok, route } from '@/lib/api';
import { OAUTH_NONCE_COOKIE, createOAuthState } from '@/lib/oauth-state';
import { appUrl, assertLiveCredentials, tiktokClient, tiktokMode } from '@/lib/tiktok';
import { cookieSecure } from '@/lib/utils';

export const GET = route(
  async () => {
    assertLiveCredentials();
    const client = tiktokClient();
    const { state, nonce } = createOAuthState();

    const store = await cookies();
    store.set(OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure(),
      path: '/',
      maxAge: 600,
    });

    // In mock mode the authorization screen is replaced by our own callback: the same flow, the
    // same state validation, no TikTok app required.
    const authorizeUrl =
      tiktokMode() === 'mock'
        ? `${appUrl()}/api/tiktok/callback?code=mock_${nonce}&state=${encodeURIComponent(state)}`
        : client.buildAuthorizeUrl(state);

    return ok({ authorizeUrl, mode: tiktokMode() });
  },
  { rateLimit: 30 },
);