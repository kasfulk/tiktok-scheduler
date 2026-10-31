import { getEffectivePolicy, prisma } from '@tiktok-scheduler/db';
import { endOfLocalDayUtc, formatLocalDate, startOfLocalDayUtc } from '@tiktok-scheduler/shared';
import { ok, route } from '@/lib/api';
import type { DashboardStats } from '@tiktok-scheduler/shared';

const CAPACITY = ['PENDING', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'MANUAL_ACTION_REQUIRED'] as const;

export const GET = route(async ({ user }) => {
  const timezone = user.timezone || 'UTC';
  const today = formatLocalDate(new Date(), timezone);
  const dayStart = startOfLocalDayUtc(today, timezone);
  const dayEnd = endOfLocalDayUtc(today, timezone);

  const accountId = user.defaultAccountId ?? null;
  const policy = await getEffectivePolicy(user.id, accountId);

  const [totalVideos, draftVideos, publishedVideos, inQueue, scheduledVideos, failedPosts, todayPublished, todayAccount, todayGlobal] =
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
      accountId
        ? prisma.scheduledPost.count({
            where: {
              accountId,
              status: { in: [...CAPACITY] },
              scheduledAt: { gte: dayStart, lte: dayEnd },
            },
          })
        : Promise.resolve(0),
      prisma.scheduledPost.count({
        where: {
          account: { userId: user.id },
          status: { in: [...CAPACITY] },
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ]);

  const usedToday = policy.limitScope === 'PER_ACCOUNT' && accountId ? todayAccount : todayGlobal;
  const config = await prisma.postingSettings.findUnique({ where: { userId: user.id } });
  const dailyLimit = config?.dailyPostingLimit ?? policy.dailyPostingLimit;

  const body: DashboardStats = {
    totalVideos,
    inQueue,
    scheduled: scheduledVideos,
    published: publishedVideos,
    failed: failedPosts,
    draft: draftVideos,
    todayPublished,
    remainingDailySlots: config?.enableDailyLimit === false ? dailyLimit : Math.max(0, dailyLimit - usedToday),
    dailyLimit,
    dailyLimitEnabled: config?.enableDailyLimit ?? true,
    timezone,
  };
  return ok(body);
});