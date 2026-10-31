import { getOrCreateAccountSettings, prisma } from '@tiktok-scheduler/db';
import { enqueueReplanUser } from '@tiktok-scheduler/queue';
import { accountPostingSettingsSchema, serializeActiveDays } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { accountPostingSettingsToDto } from '@/lib/dto';

async function ownedAccount(userId: string, accountId: string) {
  const account = await prisma.tikTokAccount.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'TikTok account not found');
  return account;
}

export const GET = route(async ({ user, params }) => {
  const accountId = requireParam(params, 'id');
  await ownedAccount(user.id, accountId);
  const settings = await getOrCreateAccountSettings(accountId);
  return ok(accountPostingSettingsToDto(settings));
});

export const PATCH = route(async ({ request, user, params }) => {
  const accountId = requireParam(params, 'id');
  await ownedAccount(user.id, accountId);
  const input = await parseBody(request, accountPostingSettingsSchema);
  await getOrCreateAccountSettings(accountId);

  const settings = await prisma.accountPostingSettings.update({
    where: { accountId },
    data: {
      enabled: input.enabled,
      dailyPostingLimit: input.dailyPostingLimit,
      minimumIntervalMinutes: input.minimumIntervalMinutes,
      activeHoursStart: input.activeHoursStart,
      activeHoursEnd: input.activeHoursEnd,
      activeDays: serializeActiveDays(input.activeDays),
      timezone: input.timezone,
    },
  });

  await enqueueReplanUser(user.id).catch(() => undefined);
  return ok(accountPostingSettingsToDto(settings));
});