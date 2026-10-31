import { prisma } from '@tiktok-scheduler/db';
import { ApiError, requireParam, route } from '@/lib/api';
import { streamStoredFile } from '@/lib/file-response';

export const runtime = 'nodejs';

export const GET = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { thumbnailKey: true },
  });
  if (!video?.thumbnailKey) throw new ApiError(404, 'THUMBNAIL_NOT_FOUND', 'Thumbnail not available');
  return streamStoredFile(video.thumbnailKey, request, 'image/jpeg');
});