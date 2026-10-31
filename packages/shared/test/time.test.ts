import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  endOfLocalDayUtc,
  formatLocalDate,
  formatLocalTime,
  getOffsetMinutes,
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  localDateTimeToUtc,
  localDayOfWeek,
  minutesToTime,
  startOfLocalDayUtc,
  timeToMinutes,
  zonedTimeToUtc,
} from '../src/time';

const MAKASSAR = 'Asia/Makassar';
const NEW_YORK = 'America/New_York';

describe('offsets', () => {
  it('reads fixed-offset zones', () => {
    expect(getOffsetMinutes(new Date('2026-11-01T00:00:00Z'), MAKASSAR)).toBe(480);
    expect(getOffsetMinutes(new Date('2026-11-01T00:00:00Z'), 'UTC')).toBe(0);
  });

  it('follows a DST-aware zone across the transition', () => {
    expect(getOffsetMinutes(new Date('2026-03-07T12:00:00Z'), NEW_YORK)).toBe(-300);
    expect(getOffsetMinutes(new Date('2026-03-09T12:00:00Z'), NEW_YORK)).toBe(-240);
  });

  it('rejects unknown zones', () => {
    expect(isValidTimeZone(MAKASSAR)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(() => getOffsetMinutes(new Date(), 'Mars/Olympus')).toThrow();
  });
});

describe('wall clock to UTC', () => {
  it('round-trips a local date and time', () => {
    const instant = localDateTimeToUtc('2026-11-01', '08:30', MAKASSAR);
    expect(instant.toISOString()).toBe('2026-11-01T00:30:00.000Z');
    expect(formatLocalDate(instant, MAKASSAR)).toBe('2026-11-01');
    expect(formatLocalTime(instant, MAKASSAR)).toBe('08:30');
  });

  it('crosses a UTC date boundary in a positive-offset zone', () => {
    const instant = localDateTimeToUtc('2026-11-02', '03:00', MAKASSAR);
    expect(instant.toISOString()).toBe('2026-11-01T19:00:00.000Z');
    expect(formatLocalDate(instant, MAKASSAR)).toBe('2026-11-02');
  });

  it('rolls a nonexistent spring-forward time forward by the gap', () => {
    // 02:30 does not exist on 2026-03-08 in New York; the next real wall clock is 03:30 EDT.
    const instant = localDateTimeToUtc('2026-03-08', '02:30', NEW_YORK);
    expect(instant.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(formatLocalTime(instant, NEW_YORK)).toBe('03:30');
  });

  it('picks the pre-transition instant for an ambiguous fall-back time', () => {
    // 01:30 happens twice on 2026-11-01; the earlier one is EDT (-240).
    const instant = localDateTimeToUtc('2026-11-01', '01:30', NEW_YORK);
    expect(instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('accepts an offset zone that matches a fixed offset', () => {
    expect(zonedTimeToUtc(2026, 1, 15, 12, 0, 'Etc/GMT-8').toISOString()).toBe('2026-01-15T04:00:00.000Z');
  });
});

describe('day boundaries', () => {
  it('spans exactly 24 hours in a zone without DST', () => {
    const start = startOfLocalDayUtc('2026-11-01', MAKASSAR);
    const end = endOfLocalDayUtc('2026-11-01', MAKASSAR);
    expect(start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000 - 1);
  });

  it('spans 23 hours on a spring-forward day', () => {
    const start = startOfLocalDayUtc('2026-03-08', NEW_YORK);
    const end = endOfLocalDayUtc('2026-03-08', NEW_YORK);
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(23 * 3600 * 1000 - 1);
  });
});

describe('local calendar helpers', () => {
  it('shifts days across month, year and leap-day boundaries', () => {
    expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addLocalDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addLocalDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes the weekday of a local date', () => {
    expect(localDayOfWeek('2026-11-01')).toBe(0);
    expect(localDayOfWeek('2026-11-02')).toBe(1);
  });

  it('validates local date and time strings', () => {
    expect(isValidLocalDate('2026-11-01')).toBe(true);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-1-1')).toBe(false);
    expect(isValidLocalTime('08:05')).toBe(true);
    expect(isValidLocalTime('24:00')).toBe(false);
    expect(isValidLocalTime('8:05')).toBe(false);
  });

  it('round-trips minutes and HH:mm', () => {
    expect(timeToMinutes('08:05')).toBe(485);
    expect(minutesToTime(485)).toBe('08:05');
    expect(minutesToTime(0)).toBe('00:00');
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});