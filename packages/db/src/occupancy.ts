import { CAPACITY_CONSUMING_STATUSES } from '@tiktok-scheduler/shared';
import { prisma } from './client';

const CAPACITY_STATUSES = [...CAPACITY_CONSUMING_STATUSES];

export interface Occupancy {
  /** Latest instant already booked on the account, so back-to-back plans keep their order. */
  lastScheduledAt: string | null;
}

export async function loadOccupancy(params: {
  userId: string;
  accountId: string;
  timezone: string;
  from: Date;
  to: Date;
  excludePostIds?: string[];
}): Promise<Occupancy> {
  const post = await prisma.scheduledPost.findFirst({
    where: {
      accountId: params.accountId,
      account: { userId: params.userId },
      status: { in: CAPACITY_STATUSES },
      scheduledAt: { lte: params.to },
      ...(params.excludePostIds?.length ? { id: { notIn: params.excludePostIds } } : {}),
    },
    orderBy: { scheduledAt: 'desc' },
    select: { scheduledAt: true },
  });

  return { lastScheduledAt: post?.scheduledAt.toISOString() ?? null };
}
