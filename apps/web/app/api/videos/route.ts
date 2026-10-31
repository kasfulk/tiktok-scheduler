import { prisma } from '@tiktok-scheduler/db';
import { listVideosQuerySchema } from '@tiktok-scheduler/shared';
import { ok, pagination, parseQuery, route } from '@/lib/api';
import { videoToDto } from '@/lib/dto';

export const GET = route(async ({ request, user }) => {
  const query = parseQuery(request, listVideosQuerySchema);

  const where = {
    userId: user.id,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q } },
            { filename: { contains: query.q } },
            { caption: { contains: query.q } },
            { hashtags: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy: { [query.sort]: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        scheduledPosts: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            accountId: true,
            account: { select: { username: true } },
          },
        },
      },
    }),
  ]);

  return ok({
    items: rows.map(videoToDto),
    ...pagination(query.page, query.pageSize, total),
  });
});