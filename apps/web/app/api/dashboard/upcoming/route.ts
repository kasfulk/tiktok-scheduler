import { prisma } from '@tiktok-scheduler/db';
import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/api';
import type { UpcomingPost } from '@tiktok-scheduler/shared';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(6) });

export const GET = route(async ({ request, user }) => {
  const { limit } = parseQuery(request, querySchema);

  const posts = await prisma.scheduledPost.findMany({
    where: {
      account: { userId: user.id },
      status: { in: ['PENDING', 'QUEUED', 'PUBLISHING'] },
      scheduledAt: { gte: new Date(Date.now() - 3_600_000) },
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    include: {
      video: { select: { id: true, title: true, thumbnailKey: true } },
      account: { select: { id: true, username: true } },
    },
  });

  const items: UpcomingPost[] = posts.map((post) => ({
    id: post.id,
    videoId: post.videoId,
    videoTitle: post.video.title,
    thumbnailUrl: post.video.thumbnailKey ? `/api/media/thumbnails/${post.videoId}` : null,
    accountId: post.accountId,
    accountUsername: post.account.username,
    scheduledAt: post.scheduledAt.toISOString(),
    status: post.status,
    timezone: post.timezone || user.timezone,
  }));

  return ok({ items });
});