import { prisma } from '@tiktok-scheduler/db';
import { endOfLocalDayUtc, formatLocalDate, startOfLocalDayUtc } from '@tiktok-scheduler/shared';
import { ok, route } from '@/lib/api';
import type { DashboardStats } from '@tiktok-scheduler/shared';

export const GET = route(async ({ user }) => {
  const timezone = user.timezone || 'UTC';
  const today = formatLocalDate(new Date(), timezone);
  const dayStart = startOfLocalDayUtc(today, timezone);
  const dayEnd = endOfLocalDayUtc(today, timezone);


  const [totalVideos, draftVideos, publishedVideos, inQueue, scheduledVideos, failedPosts, todayPublished] =
    await Promise.all([
      prisma.video.count({ where: { userId: user.id } }),
      prisma.video.count({ where: { userId: user.id, status: { in: ['DRAFT', 'READY', 'PROCESSING', 'UPLOADING'] } } }),
      prisma.video.count({ where: { userId: user.id, status: 'PUBLISHED' } }),
      prisma.scheduledPost.count({ where: { account: { userId: user.id }, status: { in: ['PENDING', 'QUEUED'] } } }),
      prisma.scheduledPost.count({
        where: { account: { userId: user.id }, status: { in: ['PENDING', 'QUEUED', 'PUBLISHING'] } },
      }),
      prisma.scheduledPost.count({
        where: { account: { userId: user.id }, status: { in: ['FAILED', 'MANUAL_ACTION_REQUIRED'] } },
      }),
      prisma.scheduledPost.count({
        where: {
          account: { userId: user.id },
          status: 'PUBLISHED',
          publishedAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ]);

  const body: DashboardStats = {
    totalVideos,
    inQueue,
    scheduled: scheduledVideos,
    published: publishedVideos,
    failed: failedPosts,
    draft: draftVideos,
    todayPublished,
    timezone,
  };
  return ok(body);
});