import { open } from 'node:fs/promises';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export const DEFAULT_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const;

export interface TikTokConfig {
  mode: 'mock' | 'live';
  baseUrl: string;
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface TikTokTokens {
  accessToken: string;
  openId: string;
  refreshToken?: string;
  expiresIn: number;
  refreshExpiresIn?: number;
  scope: string;
  tokenType: string;
}

export interface TikTokUserProfile {
  openId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CreatorInfo {
  creatorUsername: string;
  creatorNickname: string;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  maxVideoPostDurationSec: number;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

export interface PostInitInput {
  title: string;
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoSizeBytes: number;
  videoDurationSec?: number;
}

export interface PostInitResult {
  publishId: string;
  uploadUrl: string;
}

export type PublishStatus =
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED';

export interface PublishStatusResult {
  status: PublishStatus;
  failReason?: string;
  publicPostIds: string[];
}

export class TikTokApiError extends Error {
  code: string;
  httpStatus: number;
  retryable: boolean;
  retryAfterMs?: number;
  requestId?: string;
  logId?: string;

  constructor(init: {
    message: string;
    code: string;
    httpStatus: number;
    retryable: boolean;
    retryAfterMs?: number;
    requestId?: string;
    logId?: string;
  }) {
    super(init.message);
    this.name = 'TikTokApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.requestId = init.requestId;
    this.logId = init.logId;
  }
}

export interface TikTokClient {
  buildAuthorizeUrl(state: string, scopes?: string[]): string;
  exchangeAuthorizationCode(code: string): Promise<TikTokTokens>;
  refreshAccessToken(refreshToken: string): Promise<TikTokTokens>;
  fetchUserProfile(accessToken: string): Promise<TikTokUserProfile>;
  queryCreatorInfo(accessToken: string): Promise<CreatorInfo>;
  initDirectPost(accessToken: string, input: PostInitInput): Promise<PostInitResult>;
  initInboxUpload(accessToken: string, input: PostInitInput): Promise<PostInitResult>;
  uploadVideoFile(uploadUrl: string, filePath: string, videoSizeBytes: number): Promise<void>;
  fetchPublishStatus(accessToken: string, publishId: string): Promise<PublishStatusResult>;
}

const CHUNK_MIN = 5 * 1024 * 1024;
const CHUNK_MAX = 64 * 1024 * 1024;
const CHUNK_TARGET = 10 * 1024 * 1024;
const SINGLE_CHUNK_LIMIT = 64 * 1024 * 1024;

function computeChunks(videoSizeBytes: number): { chunkSize: number; totalChunkCount: number } {
  if (videoSizeBytes <= SINGLE_CHUNK_LIMIT) {
    return { chunkSize: videoSizeBytes, totalChunkCount: 1 };
  }
  const chunkSize = Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, CHUNK_TARGET));
  const totalChunkCount = Math.ceil(videoSizeBytes / chunkSize);
  return { chunkSize, totalChunkCount };
}

interface ParsedApiError {
  code: string;
  message: string;
  logId?: string;
}

function readErrorFromBody(body: unknown): ParsedApiError | null {
  if (!body || typeof body !== 'object' || !('error' in body)) return null;
  const err = body.error;
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : 'unknown';
  if (code === 'ok') return null;
  const message = typeof e.message === 'string' ? e.message : 'TikTok API error';
  const logId = typeof e.log_id === 'string' ? e.log_id : undefined;
  return { code, message, logId };
}

function formEncode(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

function parseTokens(body: unknown): TikTokTokens {
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const accessToken = data.access_token;
  const openId = data.open_id;
  const expiresIn = data.expires_in;
  const scope = data.scope;
  const tokenType = data.token_type ?? 'Bearer';
  if (typeof accessToken !== 'string' || typeof openId !== 'string') {
    throw new Error('missing token fields');
  }
  if (typeof expiresIn !== 'number') {
    throw new Error('missing expires_in');
  }
  return {
    accessToken,
    openId,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expiresIn,
    refreshExpiresIn:
      typeof data.refresh_expires_in === 'number' ? data.refresh_expires_in : undefined,
    scope: typeof scope === 'string' ? scope : '',
    tokenType: typeof tokenType === 'string' ? tokenType : 'Bearer',
  };
}

const VALID_STATUSES: Record<PublishStatus, true> = {
  PROCESSING_UPLOAD: true,
  PROCESSING_DOWNLOAD: true,
  SEND_TO_USER_INBOX: true,
  PUBLISH_COMPLETE: true,
  FAILED: true,
};

function buildError(params: {
  message: string;
  code: string;
  httpStatus: number;
  retryAfterSec?: number;
  logId?: string;
}): TikTokApiError {
  const status = params.httpStatus;
  const retryableStatus =
    status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  const nonRetryableCode =
    params.code === 'access_token_invalid' || params.code === 'scope_permission_missed';
  const retryable =
    status === 0 ? true : retryableStatus && !nonRetryableCode;
  return new TikTokApiError({
    message: params.message,
    code: params.code,
    httpStatus: status,
    retryable,
    retryAfterMs:
      status === 429 && Number.isFinite(params.retryAfterSec)
        ? (params.retryAfterSec as number) * 1000
        : undefined,
    logId: params.logId,
  });
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

type ExtractResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function handleResponse<T>(
  res: Response,
  extract: (body: unknown) => ExtractResult<T>,
): Promise<T> {
  const retryAfterHeader = res.headers.get('retry-after');
  const retryAfterParsed = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
  const retryAfterSec = Number.isFinite(retryAfterParsed) ? retryAfterParsed : undefined;

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const parsed = readErrorFromBody(body);
    throw buildError({
      message: parsed?.message ?? `HTTP ${res.status}`,
      code: parsed?.code ?? `http_${res.status}`,
      httpStatus: res.status,
      retryAfterSec,
      logId: parsed?.logId,
    });
  }

  const body = await parseJsonSafe(res);
  const err = readErrorFromBody(body);
  if (err) {
    throw buildError({
      message: err.message,
      code: err.code,
      httpStatus: res.status,
      retryAfterSec,
      logId: err.logId,
    });
  }
  if (!body || typeof body !== 'object') {
    throw buildError({
      message: 'Empty response',
      code: 'empty_response',
      httpStatus: res.status,
    });
  }
  const result = extract(body);
  if (!result.ok) {
    throw buildError({
      message: result.error,
      code: 'invalid_response',
      httpStatus: res.status,
    });
  }
  return result.value;
}

export function createTikTokClient(config: TikTokConfig): TikTokClient {
  const fetchImpl: typeof fetch = config.fetchImpl ?? fetch;
  const authBase = 'https://www.tiktok.com';
  const base = config.baseUrl.replace(/\/$/, '');

  async function postJson<T>(
    path: string,
    accessToken: string,
    body: unknown,
    extract: (b: unknown) => ExtractResult<T>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw buildError({
        message: (e as Error).message ?? 'network error',
        code: 'network_error',
        httpStatus: 0,
      });
    }
    return handleResponse(res, extract);
  }

  async function postForm(path: string, params: Record<string, string | undefined>): Promise<TikTokTokens> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formEncode(params),
      });
    } catch (e) {
      throw buildError({
        message: (e as Error).message ?? 'network error',
        code: 'network_error',
        httpStatus: 0,
      });
    }
    return handleResponse(res, (body) => {
      try {
        return { ok: true as const, value: parseTokens(body) };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    });
  }

  function initBody(input: PostInitInput, includePostInfo: boolean): Record<string, unknown> {
    const { chunkSize, totalChunkCount } = computeChunks(input.videoSizeBytes);
    const sourceInfo = {
      source: 'FILE_UPLOAD',
      video_size: input.videoSizeBytes,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    };
    if (!includePostInfo) return { source_info: sourceInfo };
    return {
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel,
        disable_comment: Boolean(input.disableComment),
        disable_duet: Boolean(input.disableDuet),
        disable_stitch: Boolean(input.disableStitch),
        video_cover_timestamp_ms: 1000,
      },
      source_info: sourceInfo,
    };
  }

  function extractInit(body: unknown): ExtractResult<PostInitResult> {
    const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const data = root.data;
    if (!data || typeof data !== 'object') return { ok: false, error: 'missing data' };
    const d = data as Record<string, unknown>;
    const publishId = typeof d.publish_id === 'string' ? d.publish_id : '';
    const uploadUrl = typeof d.upload_url === 'string' ? d.upload_url : '';
    if (!publishId || !uploadUrl) return { ok: false, error: 'missing publish_id or upload_url' };
    return { ok: true, value: { publishId, uploadUrl } };
  }

  return {
    buildAuthorizeUrl(state: string, scopes?: string[]): string {
      const scopeList = (scopes ?? DEFAULT_SCOPES).join(',');
      const query = new URLSearchParams({
        client_key: config.clientKey,
        scope: scopeList,
        response_type: 'code',
        redirect_uri: config.redirectUri,
        state,
      });
      return `${authBase}/v2/auth/authorize/?${query.toString()}`;
    },

    exchangeAuthorizationCode(code: string): Promise<TikTokTokens> {
      return postForm('/v2/oauth/token/', {
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      });
    },

    refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
      return postForm('/v2/oauth/token/', {
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
    },

    async fetchUserProfile(accessToken: string): Promise<TikTokUserProfile> {
      const url = `${base}/v2/user/info/?fields=open_id,avatar_url,display_name`;
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (e) {
        throw buildError({
          message: (e as Error).message ?? 'network error',
          code: 'network_error',
          httpStatus: 0,
        });
      }
      return handleResponse(res, (body) => {
        if (!body || typeof body !== 'object' || !('data' in body)) {
          return { ok: false, error: 'missing user' };
        }
        const root = body as { data?: unknown };
        const data = root.data;
        if (!data || typeof data !== 'object' || !('user' in data)) {
          return { ok: false, error: 'missing user' };
        }
        const userData = data as { user?: unknown };
        const user = userData.user;
        if (!user || typeof user !== 'object') return { ok: false, error: 'missing user' };
        const u = user as Record<string, unknown>;
        const openId = typeof u.open_id === 'string' ? u.open_id : '';
        const displayName = typeof u.display_name === 'string' ? u.display_name : null;
        const avatarUrl = typeof u.avatar_url === 'string' ? u.avatar_url : null;
        const username = displayName && displayName.length > 0 ? displayName : openId;
        return { ok: true, value: { openId, username, displayName, avatarUrl } };
      });
    },

    async queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
      return postJson('/v2/post/publish/creator_info/query/', accessToken, {}, (body) => {
        if (!body || typeof body !== 'object' || !('data' in body)) {
          return { ok: false, error: 'missing data' };
        }
        const root = body as { data?: unknown };
        const data = root.data;
        if (!data || typeof data !== 'object') return { ok: false, error: 'missing data' };
        const d = data as Record<string, unknown>;
        const privacy = Array.isArray(d.privacy_level_options)
          ? d.privacy_level_options.filter((x): x is string => typeof x === 'string')
          : [];
        const maxDur =
          typeof d.max_video_post_duration_sec === 'number'
            ? d.max_video_post_duration_sec
            : 0;
        return {
          ok: true,
          value: {
            creatorUsername: String(d.creator_username ?? ''),
            creatorNickname: String(d.creator_nickname ?? ''),
            creatorAvatarUrl:
              typeof d.creator_avatar_url === 'string' ? d.creator_avatar_url : null,
            privacyLevelOptions: privacy,
            maxVideoPostDurationSec: maxDur,
            commentDisabled: Boolean(d.comment_disabled),
            duetDisabled: Boolean(d.duet_disabled),
            stitchDisabled: Boolean(d.stitch_disabled),
          },
        };
      });
    },

    initDirectPost(accessToken: string, input: PostInitInput): Promise<PostInitResult> {
      return postJson(
        '/v2/post/publish/video/init/',
        accessToken,
        initBody(input, true),
        extractInit,
      );
    },

    initInboxUpload(accessToken: string, input: PostInitInput): Promise<PostInitResult> {
      return postJson(
        '/v2/post/publish/inbox/video/init/',
        accessToken,
        initBody(input, false),
        extractInit,
      );
    },

    async uploadVideoFile(
      uploadUrl: string,
      filePath: string,
      videoSizeBytes: number,
    ): Promise<void> {
      const { chunkSize, totalChunkCount } = computeChunks(videoSizeBytes);
      const handle = await open(filePath, 'r');
      try {
        const buf = Buffer.alloc(chunkSize);
        for (let i = 0; i < totalChunkCount; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, videoSizeBytes);
          const toRead = end - start;
          const { bytesRead } = await handle.read(buf, 0, toRead, start);
          if (bytesRead !== toRead) {
            throw buildError({
              message: `short read: expected ${toRead} got ${bytesRead}`,
              code: 'short_read',
              httpStatus: 0,
            });
          }
          const slice = buf.subarray(0, bytesRead);
          const range = `bytes ${start}-${end - 1}/${videoSizeBytes}`;
          let res: Response;
          try {
            res = await fetchImpl(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Range': range,
                'Content-Length': String(bytesRead),
              },
              body: slice,
            });
          } catch (e) {
            throw buildError({
              message: (e as Error).message ?? 'network error',
              code: 'network_error',
              httpStatus: 0,
            });
          }
          if (!res.ok) {
            const body = await parseJsonSafe(res);
            const parsed = readErrorFromBody(body);
            throw buildError({
              message: parsed?.message ?? `upload HTTP ${res.status}`,
              code: parsed?.code ?? `http_${res.status}`,
              httpStatus: res.status,
            });
          }
        }
      } finally {
        await handle.close();
      }
    },

    async fetchPublishStatus(
      accessToken: string,
      publishId: string,
    ): Promise<PublishStatusResult> {
      return postJson('/v2/post/publish/status/fetch/', accessToken, { publish_id: publishId }, (body) => {
        if (!body || typeof body !== 'object' || !('data' in body)) {
          return { ok: false, error: 'missing data' };
        }
        const root = body as { data?: unknown };
        const data = root.data;
        if (!data || typeof data !== 'object') return { ok: false, error: 'missing data' };
        const d = data as Record<string, unknown>;
        const status = d.status;
        if (typeof status !== 'string' || !(status in VALID_STATUSES)) {
          return { ok: false, error: `invalid status: ${String(status)}` };
        }
        const failReason =
          typeof d.fail_reason === 'string' && d.fail_reason.length > 0
            ? d.fail_reason
            : undefined;
        const rawIds = d.publicaly_available_post_id ?? d.publicly_available_post_id;
        const publicPostIds = Array.isArray(rawIds)
          ? rawIds
              .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
              .map(String)
          : [];
        return {
          ok: true,
          value: { status: status as PublishStatus, failReason, publicPostIds },
        };
      });
    },
  };
}

export interface MockTikTokServerOptions {
  port?: number;
  statusPollsToReturnProcessing?: number;
  onRecord?: (req: MockRecordedRequest) => void;
}

export interface MockRecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface MockTikTokServerHandle {
  url: string;
  close(): Promise<void>;
  requests: MockRecordedRequest[];
}

function listen(server: Server, port: number, host: string): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(port, host, () => resolve());
  return promise;
}

function closeServer(server: Server): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.close(() => resolve());
  return promise;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function parseRequestBody(raw: Buffer, contentType: string | undefined): unknown {
  if (raw.length === 0) return undefined;
  const ct = contentType ?? '';
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return undefined;
    }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw.toString('utf8')).entries());
  }
  return undefined;
}

export async function startMockTikTokServer(
  options?: MockTikTokServerOptions,
): Promise<MockTikTokServerHandle> {
  const requests: MockRecordedRequest[] = [];
  let statusPollCount = 0;
  const pollsBeforeComplete = options?.statusPollsToReturnProcessing ?? 1;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const rawBody = await readRequestBody(req);
    const parsedBody = parseRequestBody(rawBody, req.headers['content-type'] as string | undefined);
    const record: MockRecordedRequest = {
      method,
      path,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: parsedBody,
    };
    requests.push(record);
    options?.onRecord?.(record);

    const auth = req.headers['authorization'];
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const host = (req.headers['host'] as string | undefined) ?? 'localhost';

    if (path === '/v2/oauth/token/' && method === 'POST') {
      const body = parsedBody as Record<string, string> | undefined;
      const grant = body?.grant_type;
      if (grant === 'authorization_code' || grant === 'refresh_token') {
        sendJson(res, 200, {
          data: {
            access_token: `mock-access-${Date.now()}`,
            open_id: 'mock-open-id',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
            refresh_expires_in: 86400,
            scope: 'user.info.basic,video.publish,video.upload',
            token_type: 'Bearer',
          },
          error: { code: 'ok', message: '', log_id: '' },
        });
        return;
      }
      sendJson(res, 400, { error: { code: 'invalid_param', message: 'bad grant', log_id: '' } });
      return;
    }

    if (path === '/v2/user/info/' && method === 'GET') {
      if (!bearer.startsWith('mock-')) {
        sendJson(res, 401, {
          error: { code: 'access_token_invalid', message: 'bad token', log_id: 'l1' },
        });
        return;
      }
      sendJson(res, 200, {
        data: {
          user: {
            open_id: 'mock-open-id',
            display_name: 'Mock User',
            avatar_url: 'https://example.com/a.png',
          },
        },
        error: { code: 'ok', message: '', log_id: '' },
      });
      return;
    }

    if (path === '/v2/post/publish/creator_info/query/' && method === 'POST') {
      sendJson(res, 200, {
        data: {
          creator_username: 'mockuser',
          creator_nickname: 'Mock',
          creator_avatar_url: 'https://example.com/a.png',
          privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_AND_FRIENDS', 'SELF_ONLY'],
          max_video_post_duration_sec: 600,
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: true,
        },
        error: { code: 'ok', message: '', log_id: '' },
      });
      return;
    }

    if (
      (path === '/v2/post/publish/video/init/' || path === '/v2/post/publish/inbox/video/init/') &&
      method === 'POST'
    ) {
      sendJson(res, 200, {
        data: {
          publish_id: `mock-publish-${Date.now()}`,
          upload_url: `http://${host}/mock/upload`,
        },
        error: { code: 'ok', message: '', log_id: '' },
      });
      return;
    }

    if (path === '/v2/post/publish/status/fetch/' && method === 'POST') {
      statusPollCount += 1;
      const status = statusPollCount >= pollsBeforeComplete ? 'PUBLISH_COMPLETE' : 'PROCESSING_UPLOAD';
      sendJson(res, 200, {
        data: {
          status,
          fail_reason: '',
          publicaly_available_post_id: ['1234567890'],
        },
        error: { code: 'ok', message: '', log_id: '' },
      });
      return;
    }

    if (path === '/mock/upload' && method === 'PUT') {
      res.statusCode = 200;
      res.end('ok');
      return;
    }

    sendJson(res, 404, { error: { code: 'not_found', message: 'nope', log_id: '' } });
  });

  await listen(server, options?.port ?? 0, '127.0.0.1');
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : (options?.port ?? 0);
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    requests,
    close: () => closeServer(server),
  };
}
