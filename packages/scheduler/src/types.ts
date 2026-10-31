import type { SchedulingMode } from '@tiktok-scheduler/shared';

export interface ScheduleSlot {
  scheduledAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
}

export interface ScheduleConstraints {
  timezone: string;
  dailyPostingLimit: number;
  minimumIntervalMinutes: number;
  activeHours: { start: string; end: string };
  activeDays: number[];
  perAccountDailyLimit?: number | null;
  globalDailyLimit?: number | null;
}

export interface ExistingOccupancy {
  perAccountDayCounts?: Record<string, number>;
  globalDayCounts?: Record<string, number>;
  lastScheduledAt?: string | null;
}

export interface GenerateScheduleInput {
  mode: SchedulingMode;
  count: number;
  startDate: string;
  startTime?: string;
  intervalMinutes?: number;
  postingTimes?: string[];
  customSlots?: { date: string; time: string }[];
  constraints: ScheduleConstraints;
  occupancy?: ExistingOccupancy;
  now: Date | string;
}

export interface GeneratedSchedule {
  slots: ScheduleSlot[];
  unscheduled: number;
  warnings: string[];
}
