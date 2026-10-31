import { prisma } from '@tiktok-scheduler/db';
import { generalSettingsSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';
import type { GeneralSettingsDto } from '@/lib/types';

export const GET = route(async ({ user }) => {
  const body: GeneralSettingsDto = {
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    defaultAccountId: user.defaultAccountId,
    telegramEnabled: user.telegramEnabled,
    telegramChatId: user.telegramChatId,
  };
  return ok(body);
});

export const PATCH = route(async ({ request, user }) => {
  const input = await parseBody(request, generalSettingsSchema);

  if (input.defaultAccountId) {
    const account = await prisma.tikTokAccount.findFirst({
      where: { id: input.defaultAccountId, userId: user.id },
      select: { id: true },
    });
    if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'That TikTok account does not belong to you');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.defaultAccountId !== undefined ? { defaultAccountId: input.defaultAccountId } : {}),
      ...(input.telegramEnabled !== undefined ? { telegramEnabled: input.telegramEnabled } : {}),
      ...(input.telegramChatId !== undefined ? { telegramChatId: input.telegramChatId } : {}),
    },
    select: {
      name: true,
      email: true,
      timezone: true,
      defaultAccountId: true,
      telegramEnabled: true,
      telegramChatId: true,
    },
  });

  const body: GeneralSettingsDto = updated;
  return ok(body);
});