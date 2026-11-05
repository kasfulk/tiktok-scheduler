import { describe, expect, it } from 'vitest';
import { formatLocalDate, formatLocalTime } from '@tiktok-scheduler/shared';
import { computeMassRescheduleInstant } from '../src/mass-schedule';

const JAKARTA = 'Asia/Jakarta';
const NEW_YORK = 'America/New_York';

describe('computeMassRescheduleInstant', () => {
  it('keeps the local date and replaces only the local time', () => {
    const current = new Date('2026-11-05T02:30:00Z'); // 09:30 in Jakarta
    const next = computeMassRescheduleInstant(current, 'TIME', '19:30', JAKARTA);

    expect(next.toISOString()).toBe('2026-11-05T12:30:00.000Z');
    expect(formatLocalDate(next, JAKARTA)).toBe('2026-11-05');
    expect(formatLocalTime(next, JAKARTA)).toBe('19:30');
  });

  it('keeps the local time and replaces only the local date', () => {
    const current = new Date('2026-11-05T02:30:00Z'); // 09:30 in Jakarta
    const next = computeMassRescheduleInstant(current, 'DATE', '2026-12-01', JAKARTA);

    expect(next.toISOString()).toBe('2026-12-01T02:30:00.000Z');
    expect(formatLocalDate(next, JAKARTA)).toBe('2026-12-01');
    expect(formatLocalTime(next, JAKARTA)).toBe('09:30');
  });

  it('round-trips the requested wall clock across a DST boundary', () => {
    const current = new Date('2026-01-15T14:30:00Z'); // 09:30 EST
    const next = computeMassRescheduleInstant(current, 'DATE', '2026-07-15', NEW_YORK);

    expect(formatLocalDate(next, NEW_YORK)).toBe('2026-07-15');
    expect(formatLocalTime(next, NEW_YORK)).toBe('09:30');
  });
});
