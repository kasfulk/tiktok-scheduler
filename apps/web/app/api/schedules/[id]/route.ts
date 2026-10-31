import {
  SchedulingError,
  cancelScheduledPost,
  prisma,
  rescheduleScheduledPost,
} from '@tiktok-scheduler/db';
import { reschedulePostSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { postToDto } from '@/lib/dto';

const include = {
  video: { select: { id: true, title: true, thumbnailKey: true, duration: true } },
  account: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
};

async function loadPost(userId: string, postId: string) {
  const post = await prisma.scheduledPost.findFirst({
    where: { id: postId, account: { userId } },
    include,
  });
  if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Scheduled post not found');
  return post;
}

export const GET = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const post = await loadPost(user.id, id);
  const logs = await prisma.publishingLog.findMany({
    where: { scheduledPostId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return ok({
    post: postToDto(post, user.timezone),
    logs: logs.map((log) => ({
      id: log.id,
      event: log.event,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt.toISOString(),
    })),
  });
});

export const PATCH = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const input = await parseBody(request, reschedulePostSchema);
  try {
    await rescheduleScheduledPost({
      userId: user.id,
      postId: id,
      scheduledAt: new Date(input.scheduledAt),
      ...(input.accountId ? { accountId: input.accountId } : {}),
    });
  } catch (error) {
    if (error instanceof SchedulingError) throw new ApiError(409, error.code, error.message, error.details);
    throw error;
  }
  const post = await loadPost(user.id, id);
  return ok(postToDto(post, user.timezone));
});

export const DELETE = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  try {
    await cancelScheduledPost({ userId: user.id, postId: id });
  } catch (error) {
    if (error instanceof SchedulingError) throw new ApiError(409, error.code, error.message, error.details);
    throw error;
  }
  return ok({ cancelled: true });
});