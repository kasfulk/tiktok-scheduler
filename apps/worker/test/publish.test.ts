import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PublishOutcome } from '../src/publish.js';
import type { MockTikTokServerHandle, TikTokClient } from '@tiktok-scheduler/tiktok';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end publishing pipeline against a real SQLite file, a real Redis lock and an in-process
 * fake TikTok API. Proves: single claim, publish-id persisted before upload, polling to PUBLISHED,
 * notifications/logs written, and that a second run never publishes twice.
 */
const workDir = mkdtempSync(path.join(tmpdir(), 'tts-publish-e2e-'));
const storageRoot = path.join(workDir, 'storage');
mkdirSync(path.join(storageRoot, 'videos'), { recursive: true });

process.env.DATABASE_URL = `file:${path.join(workDir, 'e2e.db')}`;
process.env.REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379';
process.env.AUTH_SECRET = 'e2e-auth-secret-0123456789abcdef0123456789abcdef';
process.env.TOKEN_ENCRYPTION_KEY = 'e2e-token-key-0123456789abcdef0123456789abcdef';
process.env.STORAGE_ROOT = storageRoot;
process.env.TIKTOK_API_MODE = 'mock';
process.env.PUBLISH_JOB_TIMEOUT_MS = '30000';

const redisUrl = process.env.REDIS_URL;

async function redisReachable(url: string): Promise<boolean> {
  const { default: Redis } = await import('ioredis');
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

const hasRedis = await redisReachable(redisUrl);

describe.skipIf(!hasRedis)('publish pipeline (e2e)', () => {
  const ids = {
    user: '',
    account: '',
    video: '',
    post: '',
  };
  let db: typeof import('@tiktok-scheduler/db');
  let closeRedis: () => Promise<void>;
  let mock: MockTikTokServerHandle;
  let createClient: (baseUrl: string) => TikTokClient;
  let publishPost: (params: { postId: string; workerId: string; client: TikTokClient }) => Promise<PublishOutcome>;

  beforeAll(async () => {
    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
      env: process.env,
      stdio: 'ignore',
    });

    // Dynamic imports: DATABASE_URL/STORAGE_ROOT must be set above before these modules initialise.
    db = await import('@tiktok-scheduler/db');
    const queue = await import('@tiktok-scheduler/queue');
    const tiktok = await import('@tiktok-scheduler/tiktok');
    const media = await import('@tiktok-scheduler/media');
    ({ publishPost } = await import('../src/publish.js'));

    await db.ready();
    closeRedis = queue.closeRedisConnections;

    mock = await tiktok.startMockTikTokServer({ statusPollsToReturnProcessing: 1 });
    createClient = (baseUrl) =>
      tiktok.createTikTokClient({
        mode: 'mock',
        baseUrl,
        clientKey: 'key',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/callback',
      });

    const user = await db.prisma.user.create({
      data: { email: 'e2e@example.com', name: 'E2E', password: await db.hashPassword('password123') },
    });
    ids.user = user.id;

    const account = await db.prisma.tikTokAccount.create({
      data: {
        userId: user.id,
        openId: 'mock-open-id',
        username: 'mockuser',
        accessToken: db.encryptSecret('mock-token'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        scopes: tiktok.DEFAULT_SCOPES.join(','),
        connectionStatus: 'CONNECTED',
      },
    });
    ids.account = account.id;

    const settings = await db.getOrCreatePostingSettings(user.id);
    await db.prisma.postingSettings.update({
      where: { id: settings.id },
      data: {
        enableDailyLimit: true,
        dailyPostingLimit: 5,
        minimumIntervalMinutes: 0,
        activeHoursStart: '00:00',
        activeHoursEnd: '23:59',
        activeDays: '1,2,3,4,5,6,7',
        timezone: 'Asia/Makassar',
        limitScope: 'PER_ACCOUNT',
      },
    });
    await db.prisma.accountPostingSettings.create({
      data: {
        accountId: account.id,
        enabled: true,
        dailyPostingLimit: 5,
        minimumIntervalMinutes: 0,
        activeHoursStart: '00:00',
        activeHoursEnd: '23:59',
        activeDays: '1,2,3,4,5,6,7',
        timezone: 'Asia/Makassar',
      },
    });

    const storageKey = 'videos/e2e-video.mp4';
    const filePath = media.absolutePathFor(storageKey);
    mkdirSync(path.dirname(filePath), { recursive: true });
    execFileSync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x240:d=1',
      '-pix_fmt',
      'yuv420p',
      filePath,
    ], { stdio: 'ignore' });

    const video = await db.prisma.video.create({
      data: {
        userId: user.id,
        title: 'E2E video',
        filename: 'e2e-video.mp4',
        storageKey,
        mimeType: 'video/mp4',
        fileSize: statSync(filePath).size,
        duration: 1,
        width: 320,
        height: 240,
        caption: 'e2e caption',
        hashtags: '#e2e',
        status: 'READY',
      },
    });
    ids.video = video.id;

    const post = await db.prisma.scheduledPost.create({
      data: {
        videoId: video.id,
        accountId: account.id,
        scheduledAt: new Date(Date.now() - 60_000),
        timezone: 'Asia/Makassar',
        status: 'QUEUED',
        idempotencyKey: 'e2e-post-1',
        publishMethod: 'DIRECT_POST',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
      },
    });
    ids.post = post.id;
  }, 90_000);

  afterAll(async () => {
    await mock?.close();
    await closeRedis?.();
    await db?.disconnect();
  });

  it('publishes once and records the outcome', async () => {
    const outcome = await publishPost({
      postId: ids.post,
      workerId: 'e2e-worker',
      client: createClient(mock.url),
    });

    const post = await db.prisma.scheduledPost.findUniqueOrThrow({ where: { id: ids.post } });
    expect(outcome, `post error: ${post.errorMessage ?? 'none'}`).toBe('PUBLISHED');
    expect(post.status).toBe('PUBLISHED');
    expect(post.externalPublishId).toContain('mock-publish-');
    expect(post.publishedPostId).toBe('1234567890');
    expect(post.publishedAt).toBeInstanceOf(Date);
    expect(post.errorMessage).toBeNull();

    const video = await db.prisma.video.findUniqueOrThrow({ where: { id: ids.video } });
    expect(video.status).toBe('PUBLISHED');

    const events = (
      await db.prisma.publishingLog.findMany({ where: { scheduledPostId: ids.post }, orderBy: { createdAt: 'asc' } })
    ).map((entry) => entry.event);
    expect(events).toContain('POST_INITIALIZED');
    expect(events).toContain('VIDEO_UPLOADED');
    expect(events).toContain('PUBLISHED');

    const notifications = await db.prisma.notification.findMany({ where: { userId: ids.user } });
    expect(notifications.map((n) => n.type)).toContain('PUBLISH_SUCCESS');

    const initCalls = mock.requests.filter((r) => r.path === '/v2/post/publish/video/init/');
    const uploads = mock.requests.filter((r) => r.path === '/mock/upload');
    expect(initCalls).toHaveLength(1);
    expect(uploads).toHaveLength(1);
    const initBody = initCalls[0]?.body as { post_info?: { title?: string } } | undefined;
    expect(initBody?.post_info?.title).toBe('e2e caption #e2e');
  }, 60_000);

  it('never publishes the same post again', async () => {
    const before = mock.requests.length;
    const outcome = await publishPost({
      postId: ids.post,
      workerId: 'e2e-worker',
      client: createClient(mock.url),
    });

    expect(outcome).toBe('SKIPPED');
    expect(mock.requests.length).toBe(before);
  }, 30_000);
});