import type { NotificationType } from '@tiktok-scheduler/shared';
import { prisma } from './client';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title.slice(0, 200),
      message: payload.message.slice(0, 2000),
    },
  });
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function listNotifications(params: {
  userId: string;
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}) {
  const where = { userId: params.userId, ...(params.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: params.userId, readAt: null } }),
  ]);
  return { items, total, unread };
}