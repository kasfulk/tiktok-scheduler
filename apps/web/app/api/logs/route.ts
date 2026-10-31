import { prisma } from '@tiktok-scheduler/db';
import { z } from 'zod';
import { ok, pagination, parseQuery, route } from '@/lib/api';

const querySchema = z.object({
  event: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = route(async ({ request, user }) => {
  const query = parseQuery(request, querySchema);

  const where = {
    scheduledPost: { account: { userId: user.id } },
    ...(query.event ? { event: { contains: query.event } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.publishingLog.count({ where }),
    prisma.publishingLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        scheduledPost: {
          select: { video: { select: { title: true } }, account: { select: { username: true } } },
        },
      },
    }),
  ]);

  return ok({
    items: rows.map((row) => ({
      id: row.id,
      event: row.event,
      scheduledPostId: row.scheduledPostId,
      errorMessage: row.errorMessage,
      requestMetadata: row.requestMetadata,
      responseMetadata: row.responseMetadata,
      createdAt: row.createdAt.toISOString(),
      videoTitle: row.scheduledPost.video.title,
      accountUsername: row.scheduledPost.account.username,
    })),
    ...pagination(query.page, query.pageSize, total),
  });
});