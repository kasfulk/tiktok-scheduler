/**
 * Minimal CDP client. Chrome started with `--remote-debugging-port=<port>` exposes an HTTP
 * endpoint for target discovery and a WebSocket per page for commands. No reconnect: a publish
 * either happens inside one short session or fails loudly.
 *
 * Uses the platform WebSocket (Node >= 22) to avoid pulling in a dependency for four methods.
 */
const NativeWebSocket: typeof WebSocket | undefined = globalThis.WebSocket;

export interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export type Send = <T = unknown>(method: string, params?: object) => Promise<T>;

/** One entry of `Network.getAllCookies`; only the fields a re-import needs. */
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

/** Shape of the handful of CDP replies this package reads. */
export interface RemoteObjectReply {
  result?: { value?: unknown; objectId?: string };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

export class BrowserError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BrowserError';
    this.code = code;
  }
}

/** Chrome's remote-debugging endpoint. Accepts both spellings so a stale `.env` still works. */
export function cdpUrl(): string {
  const raw = process.env.BROWSER_CDP_URL ?? process.env.BROWSER_CDP ?? 'http://127.0.0.1:9333';
  return raw.replace(/\/$/, '');
}

async function http<T>(path: string, method = 'GET'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${cdpUrl()}${path}`, { method });
  } catch (error) {
    throw unreachable(error);
  }
  if (!response.ok) {
    throw new BrowserError('BROWSER_UNREACHABLE', `Chromium CDP responded ${response.status} on ${path}`);
  }
  return (await response.json()) as T;
}

export function unreachable(error: unknown): BrowserError {
  const reason = error instanceof Error ? error.message : String(error);
  return new BrowserError(
    'BROWSER_UNREACHABLE',
    `Cannot reach Chromium on ${cdpUrl()} (${reason}). Start it with --remote-debugging-port and keep the TikTok login in that profile.`,
  );
}

export function listTargets(): Promise<CdpTarget[]> {
  return http<CdpTarget[]>('/json/list');
}

export function openTarget(url: string): Promise<CdpTarget> {
  return http<CdpTarget>(`/json/new?${encodeURIComponent(url)}`, 'PUT');
}

export function closeTarget(id: string): Promise<unknown> {
  return http(`/json/close/${id}`).catch(() => undefined);
}

export function firstPageTarget(targets: CdpTarget[], match?: (t: CdpTarget) => boolean): CdpTarget | undefined {
  return targets.find((t) => t.type === 'page' && Boolean(t.webSocketDebuggerUrl) && (match ? match(t) : true));
}

export async function withSession<T>(wsUrl: string, fn: (send: Send) => Promise<T>): Promise<T> {
  if (!NativeWebSocket) {
    throw new BrowserError('BROWSER_UNSUPPORTED_RUNTIME', 'This Node runtime has no global WebSocket (needs Node >= 22)');
  }
  const ws = new NativeWebSocket(wsUrl);
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new BrowserError('BROWSER_UNREACHABLE', 'CDP socket error')), {
      once: true,
    });
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

  const send: Send = <R = unknown>(method: string, params: object = {}) =>
    new Promise<R>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new BrowserError('BROWSER_TIMEOUT', `CDP command ${method} timed out`));
      }, 60_000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as R);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  try {
    return await fn(send);
  } finally {
    ws.close();
  }
}

/** Evaluate an expression in the page; page exceptions become BrowserError. */
export async function evaluate<T = unknown>(send: Send, expression: string): Promise<T> {
  const reply = await send<RemoteObjectReply>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reply?.exceptionDetails) {
    const details = reply.exceptionDetails;
    const text = details.exception?.description ?? details.text ?? 'page script failed';
    throw new BrowserError('BROWSER_SCRIPT_FAILED', String(text).slice(0, 400));
  }
  return reply?.result?.value as T;
}

/**
 * Attach a local file to the `input[type=file]` matched by the selector. Polls: React mounts the
 * upload input ~2 s after the tab opens, so a single query right after `openTarget` matches nothing.
 */
export async function setFileInput(
  send: Send,
  selector: string,
  filePath: string,
  timeoutMs = 30_000,
): Promise<void> {
  await send('DOM.enable');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const node = await send<RemoteObjectReply>('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
    });
    const objectId = node?.result?.objectId;
    if (objectId) {
      await send('DOM.setFileInputFiles', { files: [filePath], objectId });
      return;
    }
    if (Date.now() >= deadline) {
      throw new BrowserError('BROWSER_SCRIPT_FAILED', `No element matched ${selector} within ${timeoutMs} ms`);
    }
    await sleep(500);
  }
}

export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}
