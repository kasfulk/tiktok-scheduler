import {
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  timeToMinutes,
  minutesToTime,
  addLocalDays,
  localDayOfWeek,
  localDateTimeToUtc,
  toDate,
} from '@tiktok-scheduler/shared';

import type {
  ScheduleSlot,
  ScheduleConstraints,
  ExistingOccupancy,
  GenerateScheduleInput,
  GeneratedSchedule,
} from './types';

const MAX_SCAN_DAYS = 1460;

/** How many slots fit in one day given the active-hours span and the slot interval. */
export function computeDailyCapacity(
  constraints: ScheduleConstraints,
  intervalMinutes: number,
): number {
  const startMin = timeToMinutes(constraints.activeHours.start);
  const endMin = timeToMinutes(constraints.activeHours.end);
  const span = endMin - startMin;
  if (span <= 0) return 0;
  return Math.max(1, Math.floor(span / intervalMinutes));
}

function validateInput(input: GenerateScheduleInput): void {
  const { constraints, mode, count, startDate, startTime, intervalMinutes, postingTimes, customSlots } = input;

  if (!isValidTimeZone(constraints.timezone)) {
    throw new RangeError(`Invalid timezone: ${constraints.timezone}`);
  }
  if (!isValidLocalDate(startDate)) {
    throw new RangeError(`Invalid startDate: ${startDate}`);
  }
  if (count < 1) {
    throw new RangeError(`count must be >= 1, got ${count}`);
  }
  if (!constraints.activeDays || constraints.activeDays.length === 0) {
    throw new RangeError('activeDays must not be empty');
  }
  for (const d of constraints.activeDays) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      throw new RangeError(`Invalid activeDay: ${d}`);
    }
  }
  if (!isValidLocalTime(constraints.activeHours.start)) {
    throw new RangeError(`Invalid activeHours.start: ${constraints.activeHours.start}`);
  }
  if (!isValidLocalTime(constraints.activeHours.end)) {
    throw new RangeError(`Invalid activeHours.end: ${constraints.activeHours.end}`);
  }
  if (timeToMinutes(constraints.activeHours.end) <= timeToMinutes(constraints.activeHours.start)) {
    throw new RangeError('activeHours.end must be after activeHours.start');
  }
  if (startTime != null && !isValidLocalTime(startTime)) {
    throw new RangeError(`Invalid startTime: ${startTime}`);
  }

  if (mode === 'INTERVAL' || mode === 'SMART') {
    if (intervalMinutes == null || intervalMinutes < 1) {
      throw new RangeError(`intervalMinutes must be >= 1 for ${mode} mode`);
    }
  }
  if (mode === 'FIXED_TIME') {
    if (!postingTimes || postingTimes.length === 0) {
      throw new RangeError('postingTimes must not be empty for FIXED_TIME mode');
    }
    for (const t of postingTimes) {
      if (!isValidLocalTime(t)) {
        throw new RangeError(`Invalid postingTime: ${t}`);
      }
    }
  }
  if (mode === 'CUSTOM') {
    if (!customSlots || customSlots.length === 0) {
      throw new RangeError('customSlots must not be empty for CUSTOM mode');
    }
    for (const slot of customSlots) {
      if (!isValidLocalDate(slot.date)) {
        throw new RangeError(`Invalid customSlot date: ${slot.date}`);
      }
      if (!isValidLocalTime(slot.time)) {
        throw new RangeError(`Invalid customSlot time: ${slot.time}`);
      }
    }
  }

  const now = toDate(input.now);
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('Invalid now date');
  }
}

function isActiveDay(localDate: string, activeDays: number[]): boolean {
  return activeDays.includes(localDayOfWeek(localDate));
}

function makeSlot(localDate: string, localTime: string, timezone: string): ScheduleSlot {
  const utc = localDateTimeToUtc(localDate, localTime, timezone);
  return {
    scheduledAt: utc.toISOString(),
    localDate,
    localTime,
    timezone,
  };
}

function nextActiveDay(localDate: string, activeDays: number[]): string {
  let candidate = addLocalDays(localDate, 1);
  let guard = 0;
  while (!isActiveDay(candidate, activeDays) && guard < 8) {
    candidate = addLocalDays(candidate, 1);
    guard++;
  }
  return candidate;
}

function generateIntervalSlots(
  input: GenerateScheduleInput,
  baseCapacityFn: () => number,
): { slots: ScheduleSlot[]; warnings: string[] } {
  const { constraints, count, startDate, startTime, intervalMinutes, occupancy, now } = input;
  const tz = constraints.timezone;
  const nowMs = toDate(now).getTime();
  const startMin = timeToMinutes(constraints.activeHours.start);
  const endMin = timeToMinutes(constraints.activeHours.end);
  const effectiveInterval = Math.max(intervalMinutes!, constraints.minimumIntervalMinutes);
  const dayStartMin = startTime ? timeToMinutes(startTime) : startMin;

  const slots: ScheduleSlot[] = [];
  const warnings: string[] = [];
  const placedPerDay = new Map<string, number>();
  let currentDay = startDate;

  let lastSlotMs: number | null = null;
  if (occupancy?.lastScheduledAt) {
    lastSlotMs = new Date(occupancy.lastScheduledAt).getTime();
  }

  let scanDays = 0;
  while (slots.length < count && scanDays < MAX_SCAN_DAYS) {
    if (!isActiveDay(currentDay, constraints.activeDays)) {
      currentDay = nextActiveDay(currentDay, constraints.activeDays);
      scanDays++;
      continue;
    }

    const placedToday = placedPerDay.get(currentDay) ?? 0;
    const dayCap = baseCapacityFn() - placedToday;
    if (dayCap <= 0) {
      currentDay = nextActiveDay(currentDay, constraints.activeDays);
      scanDays++;
      continue;
    }

    let minuteOfDay = dayStartMin;
    let lastMinuteOnDay = -Infinity;
    let placedOnDay = 0;

    while (slots.length < count && minuteOfDay < endMin) {
      if (placedOnDay >= dayCap) break;

      const gapOk = minuteOfDay - lastMinuteOnDay >= effectiveInterval;
      if (!gapOk) {
        minuteOfDay += effectiveInterval;
        continue;
      }

      const slot = makeSlot(currentDay, minutesToTime(minuteOfDay), tz);
      const slotMs = new Date(slot.scheduledAt).getTime();

      if (slotMs < nowMs) {
        minuteOfDay += effectiveInterval;
        continue;
      }

      if (lastSlotMs != null && slotMs - lastSlotMs < constraints.minimumIntervalMinutes * 60_000) {
        minuteOfDay += effectiveInterval;
        continue;
      }

      slots.push(slot);
      lastSlotMs = slotMs;
      lastMinuteOnDay = minuteOfDay;
      placedOnDay++;
      minuteOfDay += effectiveInterval;
    }

    placedPerDay.set(currentDay, placedToday + placedOnDay);
    currentDay = nextActiveDay(currentDay, constraints.activeDays);
    scanDays++;
  }

  if (slots.length < count) {
    warnings.push('capacity exhausted within 4 years');
  }

  return { slots, warnings };
}

function generateFixedTimeSlots(input: GenerateScheduleInput): { slots: ScheduleSlot[]; warnings: string[] } {
  const { constraints, count, startDate, postingTimes, occupancy, now } = input;
  const tz = constraints.timezone;
  const nowMs = toDate(now).getTime();

  const sortedTimes = [...postingTimes!].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const maxPerDay = sortedTimes.length;

  const slots: ScheduleSlot[] = [];
  const warnings: string[] = [];
  const placedPerDay = new Map<string, number>();
  let currentDay = startDate;

  let lastSlotMs: number | null = null;
  if (occupancy?.lastScheduledAt) {
    lastSlotMs = new Date(occupancy.lastScheduledAt).getTime();
  }

  let scanDays = 0;
  while (slots.length < count && scanDays < MAX_SCAN_DAYS) {
    if (!isActiveDay(currentDay, constraints.activeDays)) {
      currentDay = nextActiveDay(currentDay, constraints.activeDays);
      scanDays++;
      continue;
    }

    const placedToday = placedPerDay.get(currentDay) ?? 0;
    const dayCap = maxPerDay - placedToday;
    if (dayCap <= 0) {
      currentDay = nextActiveDay(currentDay, constraints.activeDays);
      scanDays++;
      continue;
    }

    let placedOnDay = 0;
    for (let i = 0; i < sortedTimes.length && slots.length < count; i++) {
      if (placedOnDay >= dayCap) break;

      const timeStr = sortedTimes[i]!;
      const slot = makeSlot(currentDay, timeStr, tz);
      const slotMs = new Date(slot.scheduledAt).getTime();

      if (slotMs < nowMs) continue;

      if (lastSlotMs != null && slotMs - lastSlotMs < constraints.minimumIntervalMinutes * 60_000) continue;

      slots.push(slot);
      lastSlotMs = slotMs;
      placedOnDay++;
    }

    placedPerDay.set(currentDay, placedToday + placedOnDay);
    currentDay = nextActiveDay(currentDay, constraints.activeDays);
    scanDays++;
  }

  if (slots.length < count) {
    warnings.push('capacity exhausted within 4 years');
  }

  return { slots, warnings };
}

function generateCustomSlots(input: GenerateScheduleInput): { slots: ScheduleSlot[]; unscheduled: number; warnings: string[] } {
  const { constraints, count, customSlots, occupancy, now } = input;
  const tz = constraints.timezone;
  const nowMs = toDate(now).getTime();
  const startMin = timeToMinutes(constraints.activeHours.start);
  const endMin = timeToMinutes(constraints.activeHours.end);

  const slots: ScheduleSlot[] = [];
  const warnings: string[] = [];
  let unscheduled = 0;

  let lastSlotMs: number | null = null;
  if (occupancy?.lastScheduledAt) {
    lastSlotMs = new Date(occupancy.lastScheduledAt).getTime();
  }

  const limit = Math.min(customSlots!.length, count);
  for (let i = 0; i < limit; i++) {
    const entry = customSlots![i]!;
    const { date, time } = entry;

    if (!isActiveDay(date, constraints.activeDays)) {
      unscheduled++;
      warnings.push(`Slot on ${date} dropped: not an active day`);
      continue;
    }

    const timeMin = timeToMinutes(time);
    if (timeMin < startMin || timeMin >= endMin) {
      unscheduled++;
      warnings.push(`Slot on ${date} dropped: outside active hours`);
      continue;
    }

    const slot = makeSlot(date, time, tz);
    const slotMs = new Date(slot.scheduledAt).getTime();

    if (slotMs < nowMs) {
      unscheduled++;
      warnings.push(`Slot on ${date} dropped: in the past`);
      continue;
    }

    if (lastSlotMs != null && slotMs - lastSlotMs < constraints.minimumIntervalMinutes * 60_000) {
      unscheduled++;
      warnings.push(`Slot on ${date} dropped: too close to previous slot`);
      continue;
    }

    slots.push(slot);
    lastSlotMs = slotMs;
  }

  return { slots, unscheduled, warnings };
}

export function generateSchedule(input: GenerateScheduleInput): GeneratedSchedule {
  validateInput(input);

  const { mode, constraints } = input;

  if (mode === 'CUSTOM') {
    const result = generateCustomSlots(input);
    return {
      slots: result.slots,
      unscheduled: result.unscheduled,
      warnings: result.warnings,
    };
  }

  if (mode === 'INTERVAL') {
    const result = generateIntervalSlots(input, () => computeDailyCapacity(constraints, input.intervalMinutes!));
    return { slots: result.slots, unscheduled: 0, warnings: result.warnings };
  }

  if (mode === 'SMART') {
    const result = generateIntervalSlots(input, () => computeDailyCapacity(constraints, input.intervalMinutes!));
    return { slots: result.slots, unscheduled: 0, warnings: result.warnings };
  }

  if (mode === 'FIXED_TIME') {
    const result = generateFixedTimeSlots(input);
    return { slots: result.slots, unscheduled: 0, warnings: result.warnings };
  }

  throw new RangeError(`Unknown scheduling mode: ${mode}`);
}
