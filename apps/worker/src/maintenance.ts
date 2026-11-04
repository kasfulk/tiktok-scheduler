import { armPublishJob, maybeBackupDatabase, prisma } from '@tiktok-scheduler/db';
import { publishJobId, publishQueue } from '@tiktok-scheduler/queue';
import { log } from '@tiktok-scheduler/shared';
import { publishTimeoutMs } from './config.js';
import { notify } from './notifier.js';

/**
 * Arm every due post from SQLite. SQLite is the source of truth: a Redis flush, a lost delayed job
 * or a worker restart is repaired by the next sweep.
 */
export async function sweepDuePosts(limit = 100): Promise<{ armed: number }> {
  const now = new Date();
  const due = await prisma.scheduledPost.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    select: { id: true, scheduledAt: true, nextAttemptAt: true },
  });

  let armed = 0;
  for (const post of due) {
    const runAt = post.nextAttemptAt ?? post.scheduledAt;
    if (await armPublishJob(post.id, runAt)) armed += 1;
  }
  if (armed > 0) log('info', 'sweep_armed_due_posts', { armed });
  return { armed };
}

/**
 * Re-arm QUEUED posts whose BullMQ job is gone or already finished. A `completed`/`failed` job
 * keeps its id, so checking existence alone leaves the row QUEUED forever with nothing to run it.
 */
export async function rearmOrphanedQueuedPosts(limit = 200): Promise<{ rearmed: number }> {
  const horizon = new Date(Date.now() + 24 * 3600 * 1000);
  const queued = await prisma.scheduledPost.findMany({
    where: { status: 'QUEUED', scheduledAt: { lte: horizon } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    select: { id: true, scheduledAt: true, nextAttemptAt: true },
  });

  const queue = publishQueue();
  let rearmed = 0;
  for (const post of queued) {
    const job = await queue.getJob(publishJobId(post.id));
    if (job) {
      const state = await job.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') continue;
    }
    // `nextAttemptAt` is the retry backoff written by failOrRetry; ignoring it here would re-arm the
    // row at `scheduledAt` (already past) and burn all attempts in seconds instead of on schedule.
    if (await armPublishJob(post.id, post.nextAttemptAt ?? post.scheduledAt)) rearmed += 1;
  }
  if (rearmed > 0) log('info', 'rearmed_orphaned_jobs', { rearmed });
  return { rearmed };
}

/**
 * Recover posts stuck in PUBLISHING (worker crash, container restart).
 * With a publish id we can safely resume polling. Without one the outcome is unknown, so the post
 * requires a human — never a blind retry that might publish twice.
 */
export async function recoverStaleClaims(): Promise<{ requeued: number; manual: number }> {
  const cutoff = new Date(Date.now() - publishTimeoutMs());
  const stale = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHING', attemptStartedAt: { lt: cutoff } },
    take: 50,
    select: {
      id: true,
      externalPublishId: true,
      video: { select: { title: true } },
      account: { select: { userId: true, username: true } },
    },
  });

  let requeued = 0;
  let manual = 0;

  for (const post of stale) {
    if (post.externalPublishId) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'QUEUED', lockedBy: null, lockedAt: null, errorMessage: 'Recovered after restart; polling' },
      });
      await armPublishJob(post.id, new Date());
      requeued += 1;
      continue;
    }

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: 'MANUAL_ACTION_REQUIRED',
        errorMessage: 'RECOVERED_UNKNOWN_OUTCOME: the worker stopped before recording a publish id. Verify in TikTok.',
      },
    });
    await notify({
      userId: post.account.userId,
      type: 'MANUAL_ACTION_REQUIRED',
      title: 'Verify a publish attempt',
      message: `"${post.video.title}" was interrupted before TikTok returned a publish id. Check @${post.account.username} on TikTok, then mark it published or reschedule.`,
    });
    manual += 1;
  }

  if (requeued + manual > 0) log('warn', 'recovered_stale_claims', { requeued, manual });
  return { requeued, manual };
}

/** Anything the maintenance tick should do, in order. */
export async function runMaintenance(): Promise<void> {
  await recoverStaleClaims();
  await rearmOrphanedQueuedPosts();
  await sweepDuePosts();
  await maybeBackupDatabase();
}