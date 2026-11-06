import { parseActiveDays, serializeActiveDays } from '@tiktok-scheduler/shared';
import { prisma } from './client';

export interface EffectivePolicy {
  minimumIntervalMinutes: number;
  activeHours: { start: string; end: string };
  activeDays: number[];
  timezone: string;
}

export async function getOrCreatePostingSettings(userId: string) {
  const existing = await prisma.postingSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.postingSettings.create({ data: { userId } });
}

export async function getOrCreateAccountSettings(accountId: string) {
  const existing = await prisma.accountPostingSettings.findUnique({ where: { accountId } });
  if (existing) return existing;
  return prisma.accountPostingSettings.create({ data: { accountId } });
}

/**
 * Merge the user-level policy with the account override. An account override that is disabled is
 * ignored entirely; otherwise it wins on hours, days and timezone.
 */
export async function getEffectivePolicy(userId: string, accountId: string | null): Promise<EffectivePolicy> {
  const userSettings = await getOrCreatePostingSettings(userId);
  const accountSettings = accountId
    ? await prisma.accountPostingSettings.findUnique({ where: { accountId } })
    : null;
  const override = accountSettings?.enabled ? accountSettings : null;

  return {
    minimumIntervalMinutes: override?.minimumIntervalMinutes ?? userSettings.minimumIntervalMinutes,
    activeHours: {
      start: override?.activeHoursStart ?? userSettings.activeHoursStart,
      end: override?.activeHoursEnd ?? userSettings.activeHoursEnd,
    },
    activeDays: parseActiveDays(override?.activeDays ?? userSettings.activeDays),
    timezone: override?.timezone ?? userSettings.timezone,
  };
}

export function settingsToJson(settings: {
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: string;
  timezone: string;
  defaultSchedulingMode: string;
  updatedAt: Date;
}) {
  return {
    minimumIntervalMinutes: settings.minimumIntervalMinutes,
    activeHoursStart: settings.activeHoursStart,
    activeHoursEnd: settings.activeHoursEnd,
    activeDays: parseActiveDays(settings.activeDays),
    timezone: settings.timezone,
    defaultSchedulingMode: settings.defaultSchedulingMode,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export { parseActiveDays, serializeActiveDays };
