import { formatLocalDate, formatLocalTime, localDateTimeToUtc } from '@tiktok-scheduler/shared';

export type MassRescheduleMode = 'TIME' | 'DATE';

/**
 * Move an instant within its own wall clock: TIME keeps the local date and replaces the local
 * time, DATE keeps the local time and replaces the local date. DST gaps resolve through
 * `localDateTimeToUtc`, exactly like every other schedule write.
 */
export function computeMassRescheduleInstant(
  current: Date,
  mode: MassRescheduleMode,
  value: string,
  timezone: string,
): Date {
  const localDate = formatLocalDate(current, timezone);
  const localTime = formatLocalTime(current, timezone);
  return mode === 'TIME'
    ? localDateTimeToUtc(localDate, value, timezone)
    : localDateTimeToUtc(value, localTime, timezone);
}
