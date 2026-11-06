import { randomUUID } from 'node:crypto';
import {
  formatLocalDate,
  formatLocalTime,
  localDateTimeToUtc,
  log,
  startOfLocalDayUtc,
  type PrivacyLevel,
  type PublishMethod,
  type SchedulingMode,
} from '@tiktok-scheduler/shared';
import { generateSchedule, type ScheduleSlot } from '@tiktok-scheduler/scheduler';
import { cancelPublishJob, schedulePublishJob } from '@tiktok-scheduler/queue';
import { prisma } from './client';
import { computeMassRescheduleInstant, type MassRescheduleMode } from './mass-schedule';
import { countDayCapacity, loadOccupancy } from './occupancy';
import { getEffectivePolicy } from './settings';

export class SchedulingError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'SchedulingError';
    this.code = code;
    this.details = details;
  }
}

export interface ScheduleRequest {
  userId: string;
  accountId: string;
  videoIds: string[];
  name?: string;
  mode: SchedulingMode;
  startDate: string;
  startTime?: string;
  intervalMinutes?: number;
  postingTimes?: string[];
  customSlots?: { date: string; time: string }[];
  dailyPostingLimit: number;
  activeDays: number[];
  activeHours: { start: string; end: string };
  timezone: string;
  publishMethod: PublishMethod;
  privacyLevel: PrivacyLevel;
  now?: Date;
}

export interface CreatedSchedule {
  batch: { id: string; name: string; schedulingMode: SchedulingMode; scheduledCount: number; createdAt: Date };
  postIds: string[];
  slots: ScheduleSlot[];
  unscheduled: number;
  warnings: string[];
}

const RE_PLANNABLE = ['PENDING', 'QUEUED'] as const;

/**
 * Plan a set of videos and persist the batch. Capacity, timezone and min-interval rules all come
 * from `@tiktok-scheduler/scheduler`; this function only loads state, persists and arms jobs.
 */
export async function createScheduleBatch(input: ScheduleRequest): Promise<CreatedSchedule> {
  const now = input.now ?? new Date();

  const videos = await prisma.video.findMany({
    where: { userId: input.userId, id: { in: input.videoIds } },
    select: { id: true, title: true, status: true },
  });
  if (videos.length !== input.videoIds.length) {
    throw new SchedulingError('VIDEO_NOT_FOUND', 'Some of the selected videos no longer exist');
  }
  const published = videos.filter((video) => video.status === 'PUBLISHED');
  if (published.length > 0) {
    throw new SchedulingError('VIDEO_PUBLISHED', 'Published videos cannot be scheduled again', {
      videoIds: published.map((video) => video.id),
    });
  }

  const account = await prisma.tikTokAccount.findFirst({
    where: { id: input.accountId, userId: input.userId },
    select: { id: true, connectionStatus: true },
  });
  if (!account) throw new SchedulingError('ACCOUNT_NOT_FOUND', 'TikTok account not found');
  if (account.connectionStatus !== 'CONNECTED') {
    throw new SchedulingError('ACCOUNT_DISCONNECTED', 'Reconnect the TikTok account before scheduling');
  }

  const policy = await getEffectivePolicy(input.userId, input.accountId);
  const dailyPostingLimit = policy.enableDailyLimit
    ? Math.min(input.dailyPostingLimit, policy.dailyPostingLimit)
    : input.dailyPostingLimit;

  const occupancy = await loadOccupancy({
    userId: input.userId,
    accountId: input.accountId,
    timezone: input.timezone,
    from: startOfLocalDayUtc(input.startDate, input.timezone),
    to: new Date(startOfLocalDayUtc(input.startDate, input.timezone).getTime() + 400 * 86_400_000),
  });

  const orderedVideoIds = input.videoIds.filter((id) => videos.some((video) => video.id === id));
  const generated = generateSchedule({
    mode: input.mode,
    count: orderedVideoIds.length,
    startDate: input.startDate,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
    ...(input.postingTimes ? { postingTimes: input.postingTimes } : {}),
    ...(input.customSlots ? { customSlots: input.customSlots } : {}),
    constraints: {
      timezone: input.timezone,
      dailyPostingLimit,
      minimumIntervalMinutes: policy.minimumIntervalMinutes,
      activeHours: input.activeHours,
      activeDays: input.activeDays,
      perAccountDailyLimit: policy.perAccountDailyLimit ?? null,
      globalDailyLimit: policy.globalDailyLimit ?? null,
    },
    occupancy,
    now,
  });

  if (generated.slots.length === 0) {
    throw new SchedulingError('NO_CAPACITY', 'No schedule slots fit the current limits and active hours', {
      warnings: generated.warnings,
    });
  }

  const batchName = input.name ?? `Batch ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  const { batch, postIds } = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.scheduleBatch.create({
      data: {
        userId: input.userId,
        name: batchName,
        schedulingMode: input.mode,
        startDate: input.startDate,
        startTime: input.startTime ?? null,
        intervalMinutes: input.intervalMinutes ?? null,
        postingTimes: input.postingTimes ? JSON.stringify(input.postingTimes) : null,
        timezone: input.timezone,
        dailyPostingLimit,
        status: 'COMPLETED',
        scheduledCount: generated.slots.length,
      },
    });

    const ids: string[] = [];
    for (const [index, slot] of generated.slots.entries()) {
      const videoId = orderedVideoIds[index];
      if (!videoId) continue;
      const post = await tx.scheduledPost.create({
        data: {
          videoId,
          accountId: input.accountId,
          batchId: createdBatch.id,
          scheduledAt: new Date(slot.scheduledAt),
          timezone: slot.timezone,
          status: 'PENDING',
          idempotencyKey: `post_${randomUUID()}`,
          publishMethod: input.publishMethod,
          privacyLevel: input.privacyLevel,
          maxRetries: Math.max(1, Number.parseInt(process.env.PUBLISH_MAX_RETRIES ?? '3', 10) || 3),
        },
        select: { id: true },
      });
      ids.push(post.id);
    }

    await tx.video.updateMany({
      where: { id: { in: orderedVideoIds.slice(0, ids.length) } },
      data: { status: 'SCHEDULED' },
    });

    return { batch: createdBatch, postIds: ids };
  }, { timeout: 20_000 });

  const posts = await prisma.scheduledPost.findMany({
    where: { id: { in: postIds } },
    select: { id: true, scheduledAt: true },
  });
  for (const post of posts) {
    await armPublishJob(post.id, post.scheduledAt);
  }

  return {
    batch: {
      id: batch.id,
      name: batch.name,
      schedulingMode: batch.schedulingMode as SchedulingMode,
      scheduledCount: batch.scheduledCount,
      createdAt: batch.createdAt,
    },
    postIds,
    slots: generated.slots,
    unscheduled: generated.unscheduled,
    warnings: generated.warnings,
  };
}

/**
 * Move one post. Refuses PUBLISHED / PUBLISHING / MANUAL_ACTION_REQUIRED rows: their outcome is
 * decided by TikTok, not by the calendar. Capacity and interval are re-checked on the target day.
 */
export async function rescheduleScheduledPost(params: {
  userId: string;
  postId: string;
  scheduledAt: Date;
  accountId?: string;
}): Promise<{ id: string }> {
  const post = await prisma.scheduledPost.findFirst({
    where: { id: params.postId, account: { userId: params.userId } },
    select: {
      id: true,
      accountId: true,
      status: true,
      timezone: true,
      video: { select: { id: true, title: true } },
    },
  });
  if (!post) throw new SchedulingError('POST_NOT_FOUND', 'Scheduled post not found');
  if (!['PENDING', 'QUEUED', 'FAILED'].includes(post.status)) {
    throw new SchedulingError('POST_IMMUTABLE', `A ${post.status.toLowerCase()} post cannot be rescheduled`);
  }

  const accountId = params.accountId ?? post.accountId;
  if (accountId !== post.accountId) {
    const account = await prisma.tikTokAccount.findFirst({
      where: { id: accountId, userId: params.userId },
      select: { connectionStatus: true },
    });
    if (!account) throw new SchedulingError('ACCOUNT_NOT_FOUND', 'TikTok account not found');
    if (account.connectionStatus !== 'CONNECTED') {
      throw new SchedulingError('ACCOUNT_DISCONNECTED', 'Reconnect that TikTok account first');
    }
  }

  const policy = await getEffectivePolicy(params.userId, accountId);
  const timezone = policy.timezone || post.timezone || 'UTC';
  const localDate = formatLocalDate(params.scheduledAt, timezone);

  if (policy.enableDailyLimit) {
    const counts = await countDayCapacity({
      userId: params.userId,
      accountId,
      localDate,
      timezone,
    });
    const ownRow = await prisma.scheduledPost.count({
      where: {
        id: post.id,
        status: { in: ['PENDING', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'MANUAL_ACTION_REQUIRED'] },
        scheduledAt: { gte: startOfLocalDayUtc(localDate, timezone) },
      },
    });
    const accountCount = counts.account - ownRow;
    const globalCount = counts.global - ownRow;

    if (accountCount + 1 > policy.dailyPostingLimit) {
      throw new SchedulingError('DAILY_LIMIT_REACHED', `${localDate} already has ${accountCount} posts for this account`);
    }
    if (policy.globalDailyLimit !== null && globalCount + 1 > policy.globalDailyLimit) {
      throw new SchedulingError('GLOBAL_LIMIT_REACHED', `${localDate} already has ${globalCount} posts across accounts`);
    }
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      scheduledAt: params.scheduledAt,
      accountId,
      timezone,
      status: 'PENDING',
      nextAttemptAt: null,
      errorMessage: null,
    },
  });

  await cancelPublishJob(post.id);
  await armPublishJob(post.id, params.scheduledAt);

  await prisma.publishingLog.create({
    data: {
      scheduledPostId: post.id,
      event: 'SCHEDULE_CHANGED',
      requestMetadata: JSON.stringify({ scheduledAt: params.scheduledAt.toISOString(), accountId }),
    },
  });
  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: 'SCHEDULE_CHANGED',
      title: 'Schedule changed',
      message: `"${post.video.title}" moved to ${formatLocalDate(params.scheduledAt, timezone)} ${formatLocalTime(params.scheduledAt, timezone)} (${timezone}).`,
    },
  });

  return { id: post.id };
}

export interface MassRescheduleResult {
  updated: number;
  staggered: number;
  skipped: { id: string; code: string; message: string }[];
}

/**
 * Bulk wall-clock edit: `TIME` sets the local time and keeps each post's date, `DATE` sets the
 * local date and keeps each post's time. Capacity/interval rules are deliberately not re-checked —
 * the user is moving their own pending queue — but immutable rows are skipped and reported, and
 * same-account posts that would land on the same instant are spaced one minute apart.
 */
export async function massReschedulePosts(params: {
  userId: string;
  postIds: string[];
  mode: MassRescheduleMode;
  value: string;
  fallbackTimezone: string;
}): Promise<MassRescheduleResult> {
  const postIds = Array.from(new Set(params.postIds));
  const posts = await prisma.scheduledPost.findMany({
    where: { id: { in: postIds }, account: { userId: params.userId } },
    select: {
      id: true,
      accountId: true,
      status: true,
      scheduledAt: true,
      timezone: true,
      video: { select: { title: true } },
    },
  });

  const skipped: MassRescheduleResult['skipped'] = [];
  const known = new Set(posts.map((post) => post.id));
  for (const id of postIds) {
    if (!known.has(id)) skipped.push({ id, code: 'POST_NOT_FOUND', message: 'Scheduled post not found' });
  }

  const mutable = posts
    .filter((post) => {
      if (['PENDING', 'QUEUED', 'FAILED'].includes(post.status)) return true;
      skipped.push({
        id: post.id,
        code: 'POST_IMMUTABLE',
        message: `A ${post.status.toLowerCase()} post cannot be rescheduled`,
      });
      return false;
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const used = new Set<string>();
  let staggered = 0;
  const moves = mutable.map((post) => {
    const timezone = post.timezone || params.fallbackTimezone;
    let scheduledAt = computeMassRescheduleInstant(post.scheduledAt, params.mode, params.value, timezone);
    const key = () => `${post.accountId}:${scheduledAt.getTime()}`;
    const original = scheduledAt.getTime();
    while (used.has(key())) {
      scheduledAt = new Date(scheduledAt.getTime() + 60_000);
    }
    if (scheduledAt.getTime() !== original) staggered += 1;
    used.add(key());
    return { post, scheduledAt };
  });

  if (moves.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const move of moves) {
          await tx.scheduledPost.update({
            where: { id: move.post.id },
            data: { scheduledAt: move.scheduledAt, status: 'PENDING', nextAttemptAt: null, errorMessage: null },
          });
        }
        await tx.publishingLog.createMany({
          data: moves.map((move) => ({
            scheduledPostId: move.post.id,
            event: 'SCHEDULE_CHANGED',
            requestMetadata: JSON.stringify({
              bulk: true,
              mode: params.mode,
              scheduledAt: move.scheduledAt.toISOString(),
              accountId: move.post.accountId,
            }),
          })),
        });
        await tx.notification.create({
          data: {
            userId: params.userId,
            type: 'SCHEDULE_CHANGED',
            title: 'Schedule updated',
            message: `${moves.length} post(s) rescheduled: ${
              params.mode === 'TIME' ? `time set to ${params.value}` : `date set to ${params.value}`
            }.`,
          },
        });
      },
      { timeout: 20_000 },
    );

    for (const move of moves) {
      await cancelPublishJob(move.post.id);
      await armPublishJob(move.post.id, move.scheduledAt);
    }
  }

  return { updated: moves.length, staggered, skipped };
}

export async function cancelScheduledPost(params: { userId: string; postId: string }): Promise<{ id: string }> {
  const post = await prisma.scheduledPost.findFirst({
    where: { id: params.postId, account: { userId: params.userId } },
    select: { id: true, status: true, video: { select: { id: true } } },
  });
  if (!post) throw new SchedulingError('POST_NOT_FOUND', 'Scheduled post not found');
  if (!['PENDING', 'QUEUED', 'FAILED'].includes(post.status)) {
    throw new SchedulingError('POST_IMMUTABLE', `A ${post.status.toLowerCase()} post cannot be cancelled`);
  }

  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'CANCELLED', nextAttemptAt: null } });
  await cancelPublishJob(post.id);

  const remaining = await prisma.scheduledPost.count({
    where: { videoId: post.video.id, status: { in: ['PENDING', 'QUEUED', 'PUBLISHING'] } },
  });
  if (remaining === 0) {
    await prisma.video.updateMany({ where: { id: post.video.id, status: 'SCHEDULED' }, data: { status: 'READY' } });
  }

  return { id: post.id };
}

/**
 * Re-plan every pending post of a user after their posting policy changed.
 *
 * Pending posts are treated as a queue in their original order and re-placed from `activeHours`
 * start using SMART distribution; posts already published/publishing keep their slot and simply
 * consume capacity.
 */
export async function replanUserPendingPosts(
  userId: string,
  now: Date = new Date(),
): Promise<{ replanned: number; skipped: number }> {
  const accounts = await prisma.tikTokAccount.findMany({
    where: { userId, connectionStatus: 'CONNECTED' },
    select: { id: true },
  });

  let replanned = 0;
  let skipped = 0;

  for (const account of accounts) {
    const policy = await getEffectivePolicy(userId, account.id);
    const pending = await prisma.scheduledPost.findMany({
      where: { accountId: account.id, status: { in: [...RE_PLANNABLE] } },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, scheduledAt: true },
    });
    if (pending.length === 0) continue;

    const timezone = policy.timezone;
    const startDate = formatLocalDate(now, timezone);
    const startTime = policy.activeHours.start;

    const occupancy = await loadOccupancy({
      userId,
      accountId: account.id,
      timezone,
      from: startOfLocalDayUtc(startDate, timezone),
      to: new Date(startOfLocalDayUtc(startDate, timezone).getTime() + 400 * 86_400_000),
      excludePostIds: pending.map((post) => post.id),
    });

    const generated = generateSchedule({
      mode: 'SMART',
      count: pending.length,
      startDate,
      startTime,
      intervalMinutes: Math.max(5, policy.minimumIntervalMinutes || 60),
      constraints: {
        timezone,
        dailyPostingLimit: policy.dailyPostingLimit,
        minimumIntervalMinutes: policy.minimumIntervalMinutes,
        activeHours: policy.activeHours,
        activeDays: policy.activeDays,
        perAccountDailyLimit: policy.perAccountDailyLimit ?? null,
        globalDailyLimit: policy.globalDailyLimit ?? null,
      },
      occupancy,
      now,
    });

    if (generated.slots.length === 0) {
      skipped += pending.length;
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
        for (const [index, slot] of generated.slots.entries()) {
          const post = pending[index];
          if (!post) break;
          await tx.scheduledPost.update({
            where: { id: post.id },
            data: { scheduledAt: new Date(slot.scheduledAt), timezone, status: 'PENDING', nextAttemptAt: null },
          });
        }
      },
      { timeout: 20_000 },
    );

    for (const [index, slot] of generated.slots.entries()) {
      const post = pending[index];
      if (!post) continue;
      await armPublishJob(post.id, new Date(slot.scheduledAt));
      replanned += 1;
    }
    skipped += Math.max(0, pending.length - generated.slots.length);

    await prisma.notification.create({
      data: {
        userId,
        type: 'SCHEDULE_CHANGED',
        title: 'Schedule re-planned',
        message: `${replanned} pending post(s) were re-distributed to respect the updated posting limits.`,
      },
    });
  }

  return { replanned, skipped };
}

/** Arm the delayed publish job; a queue outage must never block the write path. */
export async function armPublishJob(postId: string, runAt: Date): Promise<boolean> {
  try {
    await schedulePublishJob(postId, runAt);
    await prisma.scheduledPost.updateMany({
      where: { id: postId, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });
    return true;
  } catch (error) {
    // The post stays PENDING and the maintenance sweep retries it, but never silently.
    log('error', 'arm_publish_job_failed', {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Local date + time of a post, used by logs and notifications. */
export function describeSlot(instant: Date, timezone: string): string {
  return `${formatLocalDate(instant, timezone)} ${formatLocalTime(instant, timezone)} (${timezone})`;
}

export { localDateTimeToUtc };