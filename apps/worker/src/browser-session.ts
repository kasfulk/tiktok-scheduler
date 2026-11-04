import { captureBrowserSession, BrowserError } from '@tiktok-scheduler/browser';
import { encryptSecret, prisma } from '@tiktok-scheduler/db';
import { log } from '@tiktok-scheduler/shared';

/**
 * Re-imports a browser-session account from the Chrome profile right before the worker posts.
 *
 * A scheduled post can fire hours after setup, so the stored cookie jar is a snapshot: the browser
 * is the live credential. This runs the same capture as the "Import from browser" button, refuses
 * to continue when the browser is logged into a different account, and persists the fresh jar.
 *
 * Throws BrowserError (WRONG_BROWSER_ACCOUNT / NO_TIKTOK_SESSION / BROWSER_UNREACHABLE) so the
 * caller can map it onto its own retry policy.
 */
export async function importBrowserSessionBeforePublish(account: {
  id: string;
  username: string;
}): Promise<{ username: string; cookieCount: number }> {
  const capture = await captureBrowserSession();
  if (capture.profile.username.toLowerCase() !== account.username.toLowerCase()) {
    throw new BrowserError(
      'WRONG_BROWSER_ACCOUNT',
      `The browser is logged in as @${capture.profile.username}, but this post belongs to @${account.username}`,
    );
  }

  await prisma.tikTokAccount.update({
    where: { id: account.id },
    data: {
      username: capture.profile.username,
      displayName: capture.profile.displayName,
      avatarUrl: capture.profile.avatarUrl,
      browserSession: encryptSecret(JSON.stringify(capture.cookies)),
      authMode: 'BROWSER',
      connectionStatus: 'CONNECTED',
      lastSyncedAt: new Date(),
    },
  });
  log('info', 'browser_session_imported', {
    accountId: account.id,
    username: capture.profile.username,
    cookieCount: capture.cookies.length,
  });
  return { username: capture.profile.username, cookieCount: capture.cookies.length };
}
