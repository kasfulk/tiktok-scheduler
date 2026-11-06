import { describe, expect, it } from 'vitest';
import { calendarDateKey } from '../lib/calendar-date';

describe('calendarDateKey', () => {
  it('keys a local midnight cell by its own calendar day', () => {
    expect(calendarDateKey(new Date(2026, 10, 20))).toBe('2026-11-20');
    expect(calendarDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(calendarDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
