import { prisma } from '@tiktok-scheduler/db';
import { queueSnapshot } from '@tiktok-scheduler/queue';
import { formatLocalTime } from '@tiktok-scheduler/shared';
import { ok, route } from '@/lib/api';
import type { QueueResponse } from '@/lib/types';

const ACTIVE_STATUSES = ['PENDING', 'QUEUED', 'PUBLISHING', 'FAILED', 'MANUAL_ACTION_REQUIRED'] as const;

export const GET = route(async ({ user }) => {
  const [snapshot, posts] = await Promise.all([
    queueSnapshot().catch(() => ({ paused: false, counts: { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 } })),
    prisma.scheduledPost.findMany({
      where: { account: { userId: user.id }, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
      include: {
        video: { select: { title: true, thumbnailKey: true, caption: true, hashtags: true } },
        account: { select: { username: true } },
      },
    }),
  ]);

  const body: QueueResponse = {
    paused: snapshot.paused,
    counts: snapshot.counts,
    items: posts.map((post) => ({
      id: post.id,
      videoId: post.videoId,
      videoTitle: post.video.title,
      thumbnailUrl: post.video.thumbnailKey ? `/api/media/thumbnails/${post.videoId}` : null,
      caption: post.video.caption,
      hashtags: post.video.hashtags,
      accountUsername: post.account.username,
      scheduledAt: post.scheduledAt.toISOString(),
      localTime: formatLocalTime(post.scheduledAt, post.timezone || user.timezone),
      status: post.status as QueueResponse['items'][number]['status'],
      retryCount: post.retryCount,
      errorMessage: post.errorMessage,
    })),
  };
  return ok(body);
});