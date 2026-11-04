/**
 * Seed a demo instance: one browser-session account, one READY video, one post due now.
 * Point it at the demo DB so the queue has something to publish through the mock server:
 *
 *   DATABASE_URL=file:$PWD/data/demo.db node scripts/seed-demo.mjs [video.mp4]
 */
import { PrismaClient } from '@prisma/client';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ?? join(repo, 'scripts/fixtures/demo-clip.mp4');
if (!existsSync(source)) {
  console.error(`No source video at ${source}. Pass one as the first argument.`);
  process.exit(1);
}

const prisma = new PrismaClient();
await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 20000;');

const storageRoot = resolve(repo, process.env.STORAGE_ROOT ?? './storage-demo');
mkdirSync(join(storageRoot, 'videos'), { recursive: true });
const key = `videos/demo-${randomUUID().slice(0, 12)}.mp4`;
copyFileSync(source, join(storageRoot, key));

const user = await prisma.user.findFirstOrThrow({ select: { id: true } });

const account = await prisma.tikTokAccount.upsert({
  where: { openId: 'tt_demo_creator' },
  create: {
    userId: user.id,
    openId: 'tt_demo_creator',
    username: 'demo.creator',
    displayName: 'Demo Creator',
    authMode: 'BROWSER',
    accessToken: '',
    scopes: 'browser.session',
    connectionStatus: 'CONNECTED',
    isDefault: true,
  },
  update: {},
  select: { id: true },
});

const video = await prisma.video.create({
  data: {
    userId: user.id,
    title: 'demo-clip',
    filename: 'demo-clip.mp4',
    storageKey: key,
    mimeType: 'video/mp4',
    fileSize: statSync(join(storageRoot, key)).size,
    duration: 3,
    width: 720,
    height: 1280,
    caption: 'Demo caption #demo #fyp',
    hashtags: '#demo #fyp',
    status: 'READY',
  },
  select: { id: true },
});

const post = await prisma.scheduledPost.create({
  data: {
    videoId: video.id,
    accountId: account.id,
    scheduledAt: new Date(Date.now() - 60_000),
    timezone: 'Asia/Makassar',
    status: 'PENDING',
    publishMethod: 'DIRECT_POST',
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    idempotencyKey: randomUUID(),
  },
  select: { id: true },
});

console.log(JSON.stringify({ accountId: account.id, videoId: video.id, postId: post.id }));
await prisma.$disconnect();
