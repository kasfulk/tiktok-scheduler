import { armPublishJob, prisma } from '@tiktok-scheduler/db';
import { ApiError, ok, requireParam, route } from '@/lib/api';

/**
 * Publish now: pull a waiting post forward to this instant. Only rows TikTok has not touched yet
 * are eligible — a PUBLISHING/MANUAL_ACTION_REQUIRED row may already be live, so it needs a human.
 */
const PUBLISH_NOW_ALLOWED = ['PENDING', 'QUEUED', 'FAILED'];

export const POST = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { userId: user.id } },
    select: { id: true, status: true },
  });
  if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Scheduled post not found');
  if (!PUBLISH_NOW_ALLOWED.includes(post.status)) {
    throw new ApiError(
      409,
      'POST_NOT_PUBLISHABLE',
      `A ${post.status.toLowerCase()} post cannot be published now`,
    );
  }

  const now = new Date();
  await prisma.scheduledPost.update({
    where: { id },
    // Move the slot itself: otherwise the maintenance sweep re-arms the old future time.
    data: { status: 'PENDING', scheduledAt: now, retryCount: 0, errorMessage: null, nextAttemptAt: null },
  });
  const armed = await armPublishJob(id, now);

  await prisma.publishingLog.create({
    data: {
      scheduledPostId: id,
      event: 'MANUAL_PUBLISH_NOW',
      requestMetadata: JSON.stringify({ scheduledAt: now.toISOString(), fromStatus: post.status }),
    },
  });

  if (!armed) throw new ApiError(503, 'QUEUE_UNAVAILABLE', 'The queue is unreachable; the post stays pending');
  return ok({ id, status: 'QUEUED' });
});
