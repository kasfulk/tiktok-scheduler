import {
  BrowserError,
  closeTarget,
  firstPageTarget,
  listTargets,
  openTarget,
  sleep,
  withSession,
  type CapturedCookie,
  type CdpTarget,
} from './cdp';
import { readProfile, type StudioProfile } from './studio';

/**
 * Reads the TikTok session straight out of the Chromium instance the user logged into by hand
 * (headed browser + `--remote-debugging-port`). No OAuth app, no client secret: we copy the
 * cookie jar from the profile and ask TikTok who those cookies belong to.
 *
 * The browser must run with a persistent `--user-data-dir`; cookies die with an ephemeral profile.
 */
export interface BrowserCapture {
  cookies: CapturedCookie[];
  profile: StudioProfile;
}

export async function captureBrowserSession(): Promise<BrowserCapture> {
  let target: CdpTarget | undefined = firstPageTarget(await listTargets(), (t) => t.url.includes('tiktok.com'));
  let created = false;

  if (!target) {
    const opened = await openTarget('https://www.tiktok.com/tiktokstudio');
    created = true;
    // The tab needs a moment before Runtime.evaluate can talk to a tiktok.com origin.
    for (let i = 0; i < 40 && !target?.webSocketDebuggerUrl; i += 1) {
      await sleep(250);
      target = firstPageTarget(await listTargets(), (t) => t.id === opened.id) ?? { ...opened };
    }
  }
  if (!target?.webSocketDebuggerUrl) {
    throw new BrowserError('BROWSER_UNREACHABLE', 'No usable Chromium page target');
  }
  const wsUrl = target.webSocketDebuggerUrl;

  try {
    return await withSession(wsUrl, async (send) => {
      await send('Network.enable');

      let cookies: CapturedCookie[] = [];
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await send<{ cookies: CapturedCookie[] }>('Network.getAllCookies');
        cookies = result.cookies.filter((c) => c.domain.endsWith('tiktok.com'));
        if (cookies.some((c) => c.name === 'sessionid' && c.value)) break;
        await sleep(500);
      }
      if (!cookies.some((c) => c.name === 'sessionid' && c.value)) {
        throw new BrowserError(
          'NO_TIKTOK_SESSION',
          'No TikTok login in this browser profile; log in there, then retry.',
        );
      }

      // Ask TikTok who owns the cookies; runs in the page so the request is signed like any other.
      const profile = await readProfile(send);
      return { cookies, profile };
    });
  } finally {
    if (created && target.id) await closeTarget(target.id);
  }
}
