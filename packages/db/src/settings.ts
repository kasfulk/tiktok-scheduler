import { parseActiveDays, serializeActiveDays, type LimitScope } from '@tiktok-scheduler/shared';
import { prisma } from './client';

export interface EffectivePolicy {
  enableDailyLimit: boolean;
  dailyPostingLimit: number;
  minimumIntervalMinutes: number;
  activeHours: { start: string; end: string };
  activeDays: number[];
  timezone: string;
  limitScope: LimitScope;
  /** Cap across every account of the user, or null when the scope is PER_ACCOUNT. */
  globalDailyLimit: number | null;
  /** Cap for this account only, or null when no account override applies. */
  perAccountDailyLimit: number | null;
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
 * ignored entirely; otherwise it wins on limit, hours, days and timezone.
 */
export async function getEffectivePolicy(userId: string, accountId: string | null): Promise<EffectivePolicy> {
  const userSettings = await getOrCreatePostingSettings(userId);
  const accountSettings = accountId
    ? await prisma.accountPostingSettings.findUnique({ where: { accountId } })
    : null;
  const override = accountSettings?.enabled ? accountSettings : null;

  const limitScope = (userSettings.limitScope === 'PER_ACCOUNT' ? 'PER_ACCOUNT' : 'GLOBAL') as LimitScope;
  const dailyPostingLimit = override?.dailyPostingLimit ?? userSettings.dailyPostingLimit;

  return {
    enableDailyLimit: userSettings.enableDailyLimit,
    dailyPostingLimit,
    minimumIntervalMinutes: override?.minimumIntervalMinutes ?? userSettings.minimumIntervalMinutes,
    activeHours: {
      start: override?.activeHoursStart ?? userSettings.activeHoursStart,
      end: override?.activeHoursEnd ?? userSettings.activeHoursEnd,
    },
    activeDays: parseActiveDays(override?.activeDays ?? userSettings.activeDays),
    timezone: override?.timezone ?? userSettings.timezone,
    limitScope,
    globalDailyLimit: limitScope === 'GLOBAL' ? dailyPostingLimit : null,
    perAccountDailyLimit: limitScope === 'PER_ACCOUNT' || override ? dailyPostingLimit : null,
  };
}

export function settingsToJson(settings: {
  enableDailyLimit: boolean;
  dailyPostingLimit: number;
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: string;
  timezone: string;
  limitScope: string;
  defaultSchedulingMode: string;
  updatedAt: Date;
}) {
  return {
    enableDailyLimit: settings.enableDailyLimit,
    dailyPostingLimit: settings.dailyPostingLimit,
    minimumIntervalMinutes: settings.minimumIntervalMinutes,
    activeHoursStart: settings.activeHoursStart,
    activeHoursEnd: settings.activeHoursEnd,
    activeDays: parseActiveDays(settings.activeDays),
    timezone: settings.timezone,
    limitScope: settings.limitScope,
    defaultSchedulingMode: settings.defaultSchedulingMode,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export { parseActiveDays, serializeActiveDays };