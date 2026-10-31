import {
  CAPACITY_CONSUMING_STATUSES,
  endOfLocalDayUtc,
  formatLocalDate,
  startOfLocalDayUtc,
  type ScheduledPostStatus,
} from '@tiktok-scheduler/shared';
import { prisma } from './client';

const CAPACITY_STATUSES = [...CAPACITY_CONSUMING_STATUSES];

export interface Occupancy {
  perAccountDayCounts: Record<string, number>;
  globalDayCounts: Record<string, number>;
  lastScheduledAt: string | null;
}

/**
 * Count capacity already consumed per local day so the planner never double-books a day, and find
 * the latest instant already used on the account so the minimum interval still holds.
 */
export async function loadOccupancy(params: {
  userId: string;
  accountId: string;
  timezone: string;
  from: Date;
  to: Date;
  excludePostIds?: string[];
}): Promise<Occupancy> {
  const posts = await prisma.scheduledPost.findMany({
    where: {
      account: { userId: params.userId },
      status: { in: CAPACITY_STATUSES },
      scheduledAt: { gte: params.from, lte: params.to },
      ...(params.excludePostIds?.length ? { id: { notIn: params.excludePostIds } } : {}),
    },
    select: { accountId: true, scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
  });

  const perAccountDayCounts: Record<string, number> = {};
  const globalDayCounts: Record<string, number> = {};
  let lastScheduledAt: string | null = null;

  for (const post of posts) {
    const day = formatLocalDate(post.scheduledAt, params.timezone);
    globalDayCounts[day] = (globalDayCounts[day] ?? 0) + 1;
    if (post.accountId !== params.accountId) continue;
    perAccountDayCounts[day] = (perAccountDayCounts[day] ?? 0) + 1;
    const iso = post.scheduledAt.toISOString();
    if (!lastScheduledAt || iso > lastScheduledAt) lastScheduledAt = iso;
  }

  return { perAccountDayCounts, globalDayCounts, lastScheduledAt };
}

/** Posts already booked on `localDate` for the account and for the whole user. */
export async function countDayCapacity(params: {
  userId: string;
  accountId: string;
  localDate: string;
  timezone: string;
  statuses?: ScheduledPostStatus[];
}): Promise<{ account: number; global: number }> {
  const from = startOfLocalDayUtc(params.localDate, params.timezone);
  const to = endOfLocalDayUtc(params.localDate, params.timezone);
  const statuses = params.statuses ? [...params.statuses] : CAPACITY_STATUSES;

  const [account, global] = await Promise.all([
    prisma.scheduledPost.count({
      where: { accountId: params.accountId, status: { in: statuses }, scheduledAt: { gte: from, lte: to } },
    }),
    prisma.scheduledPost.count({
      where: {
        account: { userId: params.userId },
        status: { in: statuses },
        scheduledAt: { gte: from, lte: to },
      },
    }),
  ]);
  return { account, global };
}

/** Latest instant used on the account before `before`, to enforce the minimum interval. */
export async function lastPostInstant(params: {
  accountId: string;
  before: Date;
  excludePostIds?: string[];
}): Promise<Date | null> {
  const post = await prisma.scheduledPost.findFirst({
    where: {
      accountId: params.accountId,
      status: { in: CAPACITY_STATUSES },
      scheduledAt: { lt: params.before },
      ...(params.excludePostIds?.length ? { id: { notIn: params.excludePostIds } } : {}),
    },
    orderBy: { scheduledAt: 'desc' },
    select: { scheduledAt: true },
  });
  return post?.scheduledAt ?? null;
}