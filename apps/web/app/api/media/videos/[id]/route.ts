import { prisma } from '@tiktok-scheduler/db';
import { ApiError, requireParam, route } from '@/lib/api';
import { streamStoredFile } from '@/lib/file-response';

export const runtime = 'nodejs';

export const GET = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { storageKey: true, mimeType: true },
  });
  if (!video) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
  return streamStoredFile(video.storageKey, request, video.mimeType);
});