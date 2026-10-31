import { prisma } from '@tiktok-scheduler/db';
import { cancelPublishJob } from '@tiktok-scheduler/queue';
import { removeStoredFile } from '@tiktok-scheduler/media';
import { bulkVideoIdsSchema } from '@tiktok-scheduler/shared';
import { ok, parseBody, route } from '@/lib/api';

export const POST = route(async ({ request, user }) => {
  const { videoIds } = await parseBody(request, bulkVideoIdsSchema);

  const videos = await prisma.video.findMany({
    where: { userId: user.id, id: { in: videoIds } },
    select: { id: true, storageKey: true, thumbnailKey: true, scheduledPosts: { select: { id: true } } },
  });

  for (const video of videos) {
    for (const post of video.scheduledPosts) {
      await cancelPublishJob(post.id).catch(() => undefined);
    }
  }

  await prisma.video.deleteMany({ where: { userId: user.id, id: { in: videos.map((video) => video.id) } } });
  await Promise.all(
    videos.flatMap((video) => [removeStoredFile(video.storageKey), removeStoredFile(video.thumbnailKey)]),
  );

  return ok({ deleted: videos.length });
});