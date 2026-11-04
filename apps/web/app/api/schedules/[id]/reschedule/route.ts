import { SchedulingError, rescheduleScheduledPost } from '@tiktok-scheduler/db';
import { reschedulePostSchema } from '@tiktok-scheduler/shared';
import { prisma } from '@tiktok-scheduler/db';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { postToDto } from '@/lib/dto';

/** Explicit reschedule endpoint (POST) — same semantics as PATCH /api/schedules/:id. */
export const POST = route(async ({ request, user, params }) => {
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

  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { userId: user.id } },
    include: {
      video: { select: { id: true, title: true, caption: true, thumbnailKey: true, duration: true } },
      account: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Scheduled post not found');
  return ok(postToDto(post, user.timezone));
});