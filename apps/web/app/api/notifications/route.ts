import { listNotifications } from '@tiktok-scheduler/db';
import { notificationQuerySchema } from '@tiktok-scheduler/shared';
import { ok, pagination, parseQuery, route } from '@/lib/api';

export const GET = route(async ({ request, user }) => {
  const query = parseQuery(request, notificationQuerySchema);
  const { items, total, unread } = await listNotifications({
    userId: user.id,
    unreadOnly: query.unreadOnly,
    page: query.page,
    pageSize: query.pageSize,
  });

  return ok({
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    unread,
    ...pagination(query.page, query.pageSize, total),
  });
});