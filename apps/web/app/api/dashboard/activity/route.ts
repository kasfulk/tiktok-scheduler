import { prisma } from '@tiktok-scheduler/db';
import { addLocalDays, formatLocalDate } from '@tiktok-scheduler/shared';
import { timelineQuerySchema } from '@tiktok-scheduler/shared';
import { ok, parseQuery, route } from '@/lib/api';
import type { ActivityPoint } from '@tiktok-scheduler/shared';

/** Published vs failed counts per local day, for the dashboard chart. */
export const GET = route(async ({ request, user }) => {
  const query = parseQuery(request, timelineQuerySchema);
  const timezone = query.timezone ?? user.timezone ?? 'UTC';

  const today = formatLocalDate(new Date(), timezone);
  const firstDay = addLocalDays(today, -(query.days - 1));

  const points = new Map<string, ActivityPoint>();
  for (let offset = 0; offset < query.days; offset += 1) {
    const date = addLocalDays(firstDay, offset);
    points.set(date, { date, published: 0, failed: 0 });
  }

  const since = new Date(Date.now() - (query.days + 2) * 86_400_000);
  const [published, failed] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { account: { userId: user.id }, status: 'PUBLISHED', publishedAt: { gte: since } },
      select: { publishedAt: true, scheduledAt: true },
    }),
    prisma.scheduledPost.findMany({
      where: {
        account: { userId: user.id },
        status: { in: ['FAILED', 'MANUAL_ACTION_REQUIRED'] },
        scheduledAt: { gte: since },
      },
      select: { scheduledAt: true },
    }),
  ]);

  for (const post of published) {
    const key = formatLocalDate(post.publishedAt ?? post.scheduledAt, timezone);
    const point = points.get(key);
    if (point) point.published += 1;
  }
  for (const post of failed) {
    const key = formatLocalDate(post.scheduledAt, timezone);
    const point = points.get(key);
    if (point) point.failed += 1;
  }

  return ok({ points: [...points.values()], timezone });
});