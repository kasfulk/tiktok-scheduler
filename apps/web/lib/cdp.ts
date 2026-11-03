import { ApiError } from '@/lib/api';

/**
 * Reads the TikTok session straight out of a Chromium instance the user logged into by hand
 * (headed browser + `--remote-debugging-port`). No OAuth app, no client secret: we copy the
 * cookie jar from the profile and ask TikTok who the cookies belong to.
 *
 * The browser must be started with a persistent `--user-data-dir`; cookies die with an
 * ephemeral profile.
 */
const CDP_URL = (process.env.BROWSER_CDP_URL ?? 'http://127.0.0.1:9333').replace(/\/$/, '');

export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export interface BrowserCapture {
  cookies: CapturedCookie[];
  profile: { openId: string; username: string; displayName: string | null; avatarUrl: string | null };
}

interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

async function http<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(`${CDP_URL}${path}`, { method });
  if (!response.ok) throw new ApiError(502, 'BROWSER_UNREACHABLE', `Chromium CDP responded ${response.status} on ${path}`);
  return (await response.json()) as T;
}

function unreachable(error: unknown): never {
  throw new ApiError(
    502,
    'BROWSER_UNREACHABLE',
    `Cannot reach Chromium on ${CDP_URL} (${error instanceof Error ? error.message : String(error)}). Start it with --remote-debugging-port.`,
  );
}

async function listTargets(): Promise<CdpTarget[]> {
  try {
    return await http<CdpTarget[]>('/json/list');
  } catch (error) {
    unreachable(error);
  }
}

async function openTarget(url: string): Promise<CdpTarget> {
  try {
    return await http<CdpTarget>(`/json/new?${encodeURIComponent(url)}`, 'PUT');
  } catch (error) {
    unreachable(error);
  }
}

/** Minimal CDP client: one socket, request ids, no reconnect (the capture is a few seconds). */
async function withSession<T>(wsUrl: string, fn: (send: (method: string, params?: object) => Promise<any>) => Promise<T>): Promise<T> {
  const ws = new WebSocket(wsUrl);
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket error')), { once: true });
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
    if (!msg.id) return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });

  const send = (method: string, params: object = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  try {
    return await fn(send);
  } finally {
    ws.close();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureBrowserSession(): Promise<BrowserCapture> {
  let target = (await listTargets()).find((t) => t.type === 'page' && t.url.includes('tiktok.com') && t.webSocketDebuggerUrl);
  let created = false;

  if (!target) {
    const opened = await openTarget('https://www.tiktok.com/tiktokstudio');
    target = { ...opened, webSocketDebuggerUrl: opened.webSocketDebuggerUrl };
    created = true;
    // The tab needs a moment before Runtime.evaluate can talk to a tiktok.com origin.
    for (let i = 0; i < 40 && !target.webSocketDebuggerUrl; i += 1) {
      await sleep(250);
      target = (await listTargets()).find((t) => t.id === opened.id) ?? target;
    }
  }
  if (!target?.webSocketDebuggerUrl) throw new ApiError(502, 'BROWSER_UNREACHABLE', 'No usable Chromium page target');

  try {
    return await withSession<BrowserCapture>(target.webSocketDebuggerUrl, async (send) => {
      await send('Network.enable');

      let cookies: CapturedCookie[] = [];
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await send('Network.getAllCookies');
        cookies = (result.cookies as CapturedCookie[]).filter((c) => c.domain.endsWith('tiktok.com'));
        if (cookies.some((c) => c.name === 'sessionid' && c.value)) break;
        await sleep(500);
      }
      if (!cookies.some((c) => c.name === 'sessionid' && c.value)) {
        throw new ApiError(400, 'NO_TIKTOK_SESSION', 'No logged-in TikTok session in that browser. Log in first, then retry.');
      }

      // Ask TikTok who owns these cookies; runs in the page so the request is signed like any other.
      const evaluated = await send('Runtime.evaluate', {
        expression: `fetch('https://www.tiktok.com/passport/web/account/info/?aid=1988', { credentials: 'include' }).then((r) => r.text())`,
        awaitPromise: true,
        returnByValue: true,
      });
      const body = evaluated?.result?.value as string | undefined;
      const data = body ? (JSON.parse(body) as { data?: Record<string, string> }).data : undefined;
      if (!data?.user_id_str) {
        throw new ApiError(400, 'NO_TIKTOK_SESSION', 'TikTok did not recognise the session cookies; log in again in the browser.');
      }

      return {
        cookies,
        profile: {
          openId: data.user_id_str,
          username: data.username || data.unique_id || data.user_id_str,
          displayName: data.screen_name || null,
          avatarUrl: data.avatar_url || null,
        },
      };
    });
  } finally {
    if (created) await http(`/json/close/${target.id}`).catch(() => undefined);
  }
}
