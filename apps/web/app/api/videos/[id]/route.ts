import { prisma } from '@tiktok-scheduler/db';
import { cancelPublishJob } from '@tiktok-scheduler/queue';
import { removeStoredFile } from '@tiktok-scheduler/media';
import { updateVideoSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { videoToDto } from '@/lib/dto';

const include = {
  scheduledPosts: {
    where: { status: { not: 'CANCELLED' } },
    orderBy: { scheduledAt: 'asc' as const },
    take: 1,
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      accountId: true,
      account: { select: { username: true } },
    },
  },
};

async function ownedVideo(userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, userId }, select: { id: true } });
  if (!video) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
  return video;
}

export const GET = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const video = await prisma.video.findFirst({ where: { id, userId: user.id }, include });
  if (!video) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
  return ok(videoToDto(video));
});

export const PATCH = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  await ownedVideo(user.id, id);
  const input = await parseBody(request, updateVideoSchema);

  const video = await prisma.video.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include,
  });

  return ok(videoToDto(video));
});

export const DELETE = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { id: true, storageKey: true, thumbnailKey: true, scheduledPosts: { select: { id: true } } },
  });
  if (!video) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');

  // Cancel armed jobs before the rows disappear, otherwise a job could publish a deleted video.
  for (const post of video.scheduledPosts) {
    await cancelPublishJob(post.id).catch(() => undefined);
  }

  await prisma.video.delete({ where: { id } });
  await Promise.all([removeStoredFile(video.storageKey), removeStoredFile(video.thumbnailKey)]);
  return ok({ deleted: 1 });
});