import { getOrCreatePostingSettings, prisma } from '@tiktok-scheduler/db';
import { enqueueReplanUser } from '@tiktok-scheduler/queue';
import { serializeActiveDays } from '@tiktok-scheduler/shared';
import { postingSettingsSchema } from '@tiktok-scheduler/shared';
import { log } from '@tiktok-scheduler/shared';
import { ok, parseBody, route } from '@/lib/api';
import { postingSettingsToDto } from '@/lib/dto';

export const GET = route(async ({ user }) => {
  const settings = await getOrCreatePostingSettings(user.id);
  return ok(postingSettingsToDto(settings));
});

export const PATCH = route(async ({ request, user }) => {
  const input = await parseBody(request, postingSettingsSchema);
  await getOrCreatePostingSettings(user.id);

  const settings = await prisma.postingSettings.update({
    where: { userId: user.id },
    data: {
      enableDailyLimit: input.enableDailyLimit,
      dailyPostingLimit: input.dailyPostingLimit,
      minimumIntervalMinutes: input.minimumIntervalMinutes,
      activeHoursStart: input.activeHoursStart,
      activeHoursEnd: input.activeHoursEnd,
      activeDays: serializeActiveDays(input.activeDays),
      timezone: input.timezone,
      limitScope: input.limitScope,
      ...(input.defaultSchedulingMode ? { defaultSchedulingMode: input.defaultSchedulingMode } : {}),
    },
  });

  // Pending posts must be re-planned under the new policy; published/publishing rows stay untouched.
  await enqueueReplanUser(user.id).catch((error: unknown) => {
    log('warn', 'replan_enqueue_failed', { error: error instanceof Error ? error.message : String(error) });
  });

  return ok(postingSettingsToDto(settings));
});