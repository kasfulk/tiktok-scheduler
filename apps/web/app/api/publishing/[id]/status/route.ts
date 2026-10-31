import { prisma } from '@tiktok-scheduler/db';
import { ApiError, ok, requireParam, route } from '@/lib/api';
import { postToDto } from '@/lib/dto';

export const GET = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const post = await prisma.scheduledPost.findFirst({
    where: { id, account: { userId: user.id } },
    include: {
      video: { select: { id: true, title: true, thumbnailKey: true, duration: true } },
      account: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      logs: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Scheduled post not found');

  return ok({
    post: postToDto(post, user.timezone),
    logs: post.logs.map((entry) => ({
      id: entry.id,
      event: entry.event,
      errorMessage: entry.errorMessage,
      requestMetadata: entry.requestMetadata,
      responseMetadata: entry.responseMetadata,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
});