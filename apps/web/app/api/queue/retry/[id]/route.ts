import { armPublishJob, prisma } from '@tiktok-scheduler/db';
import { ApiError, ok, requireParam, route } from '@/lib/api';

/**
 * Manual retry. Only rows whose previous attempt ended with a known failure may be retried; an
 * attempt with an unknown outcome stays MANUAL_ACTION_REQUIRED until a human confirms on TikTok.
 */
export const POST = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { userId: user.id } },
    select: { id: true, status: true, scheduledAt: true, videoId: true },
  });
  if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Scheduled post not found');
  if (post.status !== 'FAILED') {
    throw new ApiError(
      409,
      'POST_NOT_RETRYABLE',
      post.status === 'MANUAL_ACTION_REQUIRED'
        ? 'This attempt ended with an unknown outcome. Check TikTok first, then mark it published or cancel it.'
        : `A ${post.status.toLowerCase()} post cannot be retried`,
    );
  }

  const scheduledAt = post.scheduledAt.getTime() > Date.now() ? post.scheduledAt : new Date();
  await prisma.scheduledPost.update({
    where: { id },
    data: { status: 'PENDING', errorMessage: null, nextAttemptAt: null },
  });
  const armed = await armPublishJob(id, scheduledAt);

  await prisma.publishingLog.create({
    data: { scheduledPostId: id, event: 'MANUAL_RETRY', requestMetadata: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }) },
  });

  if (!armed) throw new ApiError(503, 'QUEUE_UNAVAILABLE', 'The queue is unreachable; the post stays pending');
  return ok({ id, status: 'QUEUED' });
});