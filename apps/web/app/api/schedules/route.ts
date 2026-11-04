import { prisma } from '@tiktok-scheduler/db';
import { listSchedulesQuerySchema } from '@tiktok-scheduler/shared';
import { ok, pagination, parseQuery, route } from '@/lib/api';
import { postToDto } from '@/lib/dto';

const include = {
  video: { select: { id: true, title: true, caption: true, thumbnailKey: true, duration: true } },
  account: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
};

export const GET = route(async ({ request, user }) => {
  const query = parseQuery(request, listSchedulesQuerySchema);

  const where = {
    account: { userId: user.id },
    ...(query.status ? { status: query.status } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.from || query.to
      ? {
          scheduledAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.scheduledPost.count({ where }),
    prisma.scheduledPost.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include,
    }),
  ]);

  return ok({
    items: rows.map((row) => postToDto(row, user.timezone)),
    ...pagination(query.page, query.pageSize, total),
  });
});