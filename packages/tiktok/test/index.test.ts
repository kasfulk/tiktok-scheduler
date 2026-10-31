import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTikTokClient,
  startMockTikTokServer,
  TikTokApiError,
  DEFAULT_SCOPES,
  type TikTokConfig,
  type MockTikTokServerHandle,
} from '../src/index.js';

describe('TikTok Client', () => {
  describe('buildAuthorizeUrl', () => {
    it('builds authorize URL with default scopes', () => {
      const config: TikTokConfig = {
        mode: 'live',
        baseUrl: 'https://open.tiktokapis.com',
        clientKey: 'test-client-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
      const client = createTikTokClient(config);
      const url = client.buildAuthorizeUrl('test-state');

      expect(url).toContain('https://www.tiktok.com/v2/auth/authorize/');
      expect(url).toContain('client_key=test-client-key');
      expect(url).toContain('scope=user.info.basic%2Cvideo.publish%2Cvideo.upload');
      expect(url).toContain('response_type=code');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
      expect(url).toContain('state=test-state');
    });

    it('builds authorize URL with custom scopes', () => {
      const config: TikTokConfig = {
        mode: 'live',
        baseUrl: 'https://open.tiktokapis.com',
        clientKey: 'test-client-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
      const client = createTikTokClient(config);
      const url = client.buildAuthorizeUrl('test-state', ['user.info.basic', 'video.upload']);

      expect(url).toContain('scope=user.info.basic%2Cvideo.upload');
    });
  });

  describe('token exchange and refresh', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;

    beforeEach(async () => {
      server = await startMockTikTokServer();
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
    });

    afterEach(async () => {
      await server.close();
    });

    it('exchanges authorization code for tokens', async () => {
      const client = createTikTokClient(config);
      const tokens = await client.exchangeAuthorizationCode('test-code');

      expect(tokens.accessToken).toMatch(/^mock-access-/);
      expect(tokens.openId).toBe('mock-open-id');
      expect(tokens.refreshToken).toBe('mock-refresh-token');
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.refreshExpiresIn).toBe(86400);
      expect(tokens.scope).toBe('user.info.basic,video.publish,video.upload');
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('refreshes access token', async () => {
      const client = createTikTokClient(config);
      const tokens = await client.refreshAccessToken('old-refresh-token');

      expect(tokens.accessToken).toMatch(/^mock-access-/);
      expect(tokens.openId).toBe('mock-open-id');
      expect(tokens.refreshToken).toBe('mock-refresh-token');
    });
  });

  describe('error handling', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;

    beforeEach(async () => {
      server = await startMockTikTokServer();
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
    });

    afterEach(async () => {
      await server.close();
    });

    it('throws TikTokApiError on 401 with access_token_invalid', async () => {
      const client = createTikTokClient(config);
      try {
        await client.fetchUserProfile('invalid-token');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TikTokApiError);
        const err = e as TikTokApiError;
        expect(err.code).toBe('access_token_invalid');
        expect(err.httpStatus).toBe(401);
        expect(err.retryable).toBe(false);
        expect(err.message).not.toContain('invalid-token');
      }
    });

    it('parses 429 Retry-After header', async () => {
      const customFetch: typeof fetch = async (_url, _init) => {
        return new Response(JSON.stringify({ error: { code: 'rate_limit', message: 'Too many requests' } }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '30',
          },
        });
      };
      const client = createTikTokClient({ ...config, fetchImpl: customFetch });
      try {
        await client.fetchUserProfile('mock-token');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TikTokApiError);
        const err = e as TikTokApiError;
        expect(err.httpStatus).toBe(429);
        expect(err.retryable).toBe(true);
        expect(err.retryAfterMs).toBe(30000);
      }
    });

    it('marks 500/502/503/504 as retryable', async () => {
      for (const status of [500, 502, 503, 504]) {
        const customFetch: typeof fetch = async () => {
          return new Response(JSON.stringify({ error: { code: 'server_error', message: 'Error' } }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        };
        const client = createTikTokClient({ ...config, fetchImpl: customFetch });
        try {
          await client.fetchUserProfile('mock-token');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(TikTokApiError);
          const err = e as TikTokApiError;
          expect(err.httpStatus).toBe(status);
          expect(err.retryable).toBe(true);
        }
      }
    });

    it('marks 400/401/403 as non-retryable', async () => {
      for (const status of [400, 401, 403]) {
        const customFetch: typeof fetch = async () => {
          return new Response(JSON.stringify({ error: { code: 'bad_request', message: 'Error' } }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        };
        const client = createTikTokClient({ ...config, fetchImpl: customFetch });
        try {
          await client.fetchUserProfile('mock-token');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(TikTokApiError);
          const err = e as TikTokApiError;
          expect(err.httpStatus).toBe(status);
          expect(err.retryable).toBe(false);
        }
      }
    });
  });

  describe('post init chunking', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;

    beforeEach(async () => {
      server = await startMockTikTokServer();
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
    });

    afterEach(async () => {
      await server.close();
    });

    it('uses single chunk for files <= 64 MiB', async () => {
      const client = createTikTokClient(config);
      const size = 50 * 1024 * 1024; // 50 MiB
      await client.initDirectPost('mock-token', {
        title: 'Test video',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        videoSizeBytes: size,
      });

      const initReq = server.requests.find((r) => r.path === '/v2/post/publish/video/init/');
      expect(initReq).toBeDefined();
      const body = initReq!.body as { source_info: { chunk_size: number; total_chunk_count: number } };
      expect(body.source_info.chunk_size).toBe(size);
      expect(body.source_info.total_chunk_count).toBe(1);
    });

    it('uses 10 MiB chunks for files > 64 MiB', async () => {
      const client = createTikTokClient(config);
      const size = 150 * 1024 * 1024; // 150 MiB
      await client.initDirectPost('mock-token', {
        title: 'Test video',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        videoSizeBytes: size,
      });

      const initReq = server.requests.find((r) => r.path === '/v2/post/publish/video/init/');
      expect(initReq).toBeDefined();
      const body = initReq!.body as { source_info: { chunk_size: number; total_chunk_count: number } };
      expect(body.source_info.chunk_size).toBe(10 * 1024 * 1024);
      expect(body.source_info.total_chunk_count).toBe(Math.ceil(size / (10 * 1024 * 1024)));
    });

    it('includes post_info for direct post but not inbox', async () => {
      const client = createTikTokClient(config);
      const input = {
        title: 'Test video #test',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        disableComment: true,
        disableDuet: false,
        disableStitch: true,
        videoSizeBytes: 1024,
      };

      await client.initDirectPost('mock-token', input);
      await client.initInboxUpload('mock-token', input);

      const directReq = server.requests.find((r) => r.path === '/v2/post/publish/video/init/');
      const inboxReq = server.requests.find((r) => r.path === '/v2/post/publish/inbox/video/init/');

      expect(directReq).toBeDefined();
      expect(inboxReq).toBeDefined();

      const directBody = directReq!.body as Record<string, unknown>;
      const inboxBody = inboxReq!.body as Record<string, unknown>;

      expect(directBody.post_info).toBeDefined();
      expect(inboxBody.post_info).toBeUndefined();
      expect(directBody.source_info).toBeDefined();
      expect(inboxBody.source_info).toBeDefined();
    });
  });

  describe('chunked upload', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;
    let tempDir: string;

    beforeEach(async () => {
      server = await startMockTikTokServer();
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
      tempDir = await mkdtemp(join(tmpdir(), 'tiktok-test-'));
    });

    afterEach(async () => {
      await server.close();
    });

    it('uploads single-chunk file', async () => {
      const client = createTikTokClient(config);
      const filePath = join(tempDir, 'video.mp4');
      const size = 1024;
      const content = Buffer.alloc(size, 'x');
      await writeFile(filePath, content);

      const initResult = await client.initDirectPost('mock-token', {
        title: 'Test',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        videoSizeBytes: size,
      });

      await client.uploadVideoFile(initResult.uploadUrl, filePath, size);

      const uploadReqs = server.requests.filter((r) => r.path === '/mock/upload');
      expect(uploadReqs.length).toBe(1);
      const req = uploadReqs[0]!;
      expect(req.method).toBe('PUT');
      expect(req.headers['content-type']).toBe('video/mp4');
      expect(req.headers['content-range']).toBe(`bytes 0-${size - 1}/${size}`);
    });

    it('uploads multi-chunk file', async () => {
      const client = createTikTokClient(config);
      const filePath = join(tempDir, 'large-video.mp4');
      const chunkSize = 10 * 1024 * 1024;
      const size = 75 * 1024 * 1024; // 75 MiB, will use 8 chunks of 10 MiB
      const content = Buffer.alloc(size, 'y');
      await writeFile(filePath, content);

      const initResult = await client.initDirectPost('mock-token', {
        title: 'Test',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        videoSizeBytes: size,
      });

      await client.uploadVideoFile(initResult.uploadUrl, filePath, size);

      const uploadReqs = server.requests.filter((r) => r.path === '/mock/upload');
      const expectedChunks = Math.ceil(size / chunkSize);
      expect(uploadReqs.length).toBe(expectedChunks);

      expect(uploadReqs[0]!.headers['content-range']).toBe(`bytes 0-${chunkSize - 1}/${size}`);
      expect(uploadReqs[1]!.headers['content-range']).toBe(`bytes ${chunkSize}-${2 * chunkSize - 1}/${size}`);
      const lastStart = (expectedChunks - 1) * chunkSize;
      expect(uploadReqs[expectedChunks - 1]!.headers['content-range']).toBe(`bytes ${lastStart}-${size - 1}/${size}`);
    });
  });

  describe('status parsing', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;

    beforeEach(async () => {
      server = await startMockTikTokServer({ statusPollsToReturnProcessing: 2 });
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
    });

    afterEach(async () => {
      await server.close();
    });

    it('parses status with misspelled field', async () => {
      const client = createTikTokClient(config);

      const status1 = await client.fetchPublishStatus('mock-token', 'publish-123');
      expect(status1.status).toBe('PROCESSING_UPLOAD');
      expect(status1.publicPostIds).toEqual(['1234567890']);

      const status2 = await client.fetchPublishStatus('mock-token', 'publish-123');
      expect(status2.status).toBe('PUBLISH_COMPLETE');
      expect(status2.publicPostIds).toEqual(['1234567890']);
    });
  });

  describe('happy path round trip', () => {
    let server: MockTikTokServerHandle;
    let config: TikTokConfig;
    let tempDir: string;

    beforeEach(async () => {
      server = await startMockTikTokServer();
      config = {
        mode: 'mock',
        baseUrl: server.url,
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'https://example.com/callback',
      };
      tempDir = await mkdtemp(join(tmpdir(), 'tiktok-test-'));
    });

    afterEach(async () => {
      await server.close();
    });

    it('completes full publish flow', async () => {
      const client = createTikTokClient(config);

      // 1. Exchange code
      const tokens = await client.exchangeAuthorizationCode('auth-code-123');
      expect(tokens.accessToken).toMatch(/^mock-access-/);

      // 2. Fetch user profile
      const profile = await client.fetchUserProfile(tokens.accessToken);
      expect(profile.openId).toBe('mock-open-id');
      expect(profile.username).toBe('Mock User');
      expect(profile.displayName).toBe('Mock User');

      // 3. Query creator info
      const creatorInfo = await client.queryCreatorInfo(tokens.accessToken);
      expect(creatorInfo.creatorUsername).toBe('mockuser');
      expect(creatorInfo.privacyLevelOptions).toContain('PUBLIC_TO_EVERYONE');
      expect(creatorInfo.maxVideoPostDurationSec).toBe(600);

      // 4. Init post
      const videoSize = 5 * 1024 * 1024; // 5 MiB
      const initResult = await client.initDirectPost(tokens.accessToken, {
        title: 'My awesome video #tiktok',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        disableComment: false,
        disableDuet: false,
        disableStitch: false,
        videoSizeBytes: videoSize,
      });
      expect(initResult.publishId).toMatch(/^mock-publish-/);
      expect(initResult.uploadUrl).toContain('/mock/upload');

      // 5. Upload video
      const filePath = join(tempDir, 'video.mp4');
      const content = Buffer.alloc(videoSize, 'z');
      await writeFile(filePath, content);
      await client.uploadVideoFile(initResult.uploadUrl, filePath, videoSize);

      // 6. Poll status
      const status = await client.fetchPublishStatus(tokens.accessToken, initResult.publishId);
      expect(status.status).toBe('PUBLISH_COMPLETE');
      expect(status.publicPostIds).toEqual(['1234567890']);

      // Verify all requests were made
      expect(server.requests.length).toBeGreaterThan(0);
      const paths = server.requests.map((r) => r.path);
      expect(paths).toContain('/v2/oauth/token/');
      expect(paths).toContain('/v2/user/info/');
      expect(paths).toContain('/v2/post/publish/creator_info/query/');
      expect(paths).toContain('/v2/post/publish/video/init/');
      expect(paths).toContain('/mock/upload');
      expect(paths).toContain('/v2/post/publish/status/fetch/');
    });
  });

  describe('DEFAULT_SCOPES', () => {
    it('exports default scopes', () => {
      expect(DEFAULT_SCOPES).toEqual(['user.info.basic', 'video.publish', 'video.upload']);
    });
  });
});
