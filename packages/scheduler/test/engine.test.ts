import { describe, it, expect } from 'vitest';
import { generateSchedule, computeDailyCapacity } from '../src/index.js';
import type { ScheduleConstraints, GenerateScheduleInput } from '../src/index.js';

const baseConstraints: ScheduleConstraints = {
  timezone: 'UTC',
  dailyPostingLimit: 10,
  minimumIntervalMinutes: 0,
  activeHours: { start: '08:00', end: '22:00' },
  activeDays: [0, 1, 2, 3, 4, 5, 6],
};

describe('INTERVAL mode', () => {
  it('places 10 videos across 2 days with 5/day limit', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 10,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 5,
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(10);
    expect(result.unscheduled).toBe(0);
    expect(result.warnings).toHaveLength(0);

    // Day 1: 08:00, 10:00, 12:00, 14:00, 16:00
    expect(result.slots[0]!.localDate).toBe('2026-11-01');
    expect(result.slots[0]!.localTime).toBe('08:00');
    expect(result.slots[1]!.localTime).toBe('10:00');
    expect(result.slots[2]!.localTime).toBe('12:00');
    expect(result.slots[3]!.localTime).toBe('14:00');
    expect(result.slots[4]!.localTime).toBe('16:00');

    // Day 2: 08:00, 10:00, 12:00, 14:00, 16:00
    expect(result.slots[5]!.localDate).toBe('2026-11-02');
    expect(result.slots[5]!.localTime).toBe('08:00');
    expect(result.slots[9]!.localTime).toBe('16:00');
  });

  it('respects minimumIntervalMinutes', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 3,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 30,
      constraints: {
        ...baseConstraints,
        minimumIntervalMinutes: 60,
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(3);
    expect(result.slots[0]!.localTime).toBe('08:00');
    expect(result.slots[1]!.localTime).toBe('09:00');
    expect(result.slots[2]!.localTime).toBe('10:00');
  });
});

describe('FIXED_TIME mode', () => {
  it('places 20 videos with 3 times/day and limit 3', () => {
    const input: GenerateScheduleInput = {
      mode: 'FIXED_TIME',
      count: 20,
      startDate: '2026-11-01',
      postingTimes: ['08:00', '12:00', '16:00', '20:00'],
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 3,
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(20);
    expect(result.unscheduled).toBe(0);

    // 3 per day, 7 days = 21 slots available, but we only need 20
    const day1Slots = result.slots.filter(s => s.localDate === '2026-11-01');
    expect(day1Slots).toHaveLength(3);
    expect(day1Slots[0]!.localTime).toBe('08:00');
    expect(day1Slots[1]!.localTime).toBe('12:00');
    expect(day1Slots[2]!.localTime).toBe('16:00');
  });
});

describe('SMART mode', () => {
  it('computes capacity and places 100 videos over 20 days', () => {
    const input: GenerateScheduleInput = {
      mode: 'SMART',
      count: 100,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 5,
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(100);
    expect(result.unscheduled).toBe(0);

    // computeDailyCapacity: floor((22-8)*60/120) = 7, clamped by dailyPostingLimit=5 => 5
    const capacity = computeDailyCapacity(input.constraints, 120);
    expect(capacity).toBe(5);

    // 100 / 5 = 20 days
    const uniqueDays = new Set(result.slots.map(s => s.localDate));
    expect(uniqueDays.size).toBe(20);
  });
});

describe('CUSTOM mode', () => {
  it('maps custom slots and drops violations', () => {
    const input: GenerateScheduleInput = {
      mode: 'CUSTOM',
      count: 5,
      startDate: '2026-11-01',
      customSlots: [
        { date: '2026-11-01', time: '09:00' },
        { date: '2026-11-02', time: '10:00' },
        { date: '2026-11-03', time: '23:00' }, // outside active hours
        { date: '2026-11-04', time: '11:00' },
        { date: '2026-11-05', time: '12:00' },
      ],
      constraints: baseConstraints,
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(4);
    expect(result.unscheduled).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('2026-11-03');
  });
});

describe('Occupancy', () => {
  it('reduces capacity based on existing occupancy', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 5,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 5,
        perAccountDailyLimit: 3,
      },
      occupancy: {
        perAccountDayCounts: { '2026-11-01': 2 },
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    // Day 1: capacity = 3 - 2 = 1 slot
    // Day 2: capacity = 3 slots
    expect(result.slots).toHaveLength(5);
    const day1Slots = result.slots.filter(s => s.localDate === '2026-11-01');
    expect(day1Slots).toHaveLength(1);
    const day2Slots = result.slots.filter(s => s.localDate === '2026-11-02');
    expect(day2Slots).toHaveLength(3);
  });

  it('enforces lastScheduledAt minimum interval', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 2,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        minimumIntervalMinutes: 60,
      },
      occupancy: {
        lastScheduledAt: '2026-11-01T07:30:00Z', // 30 min before 08:00
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    // First slot at 08:00 is only 30 min after lastScheduledAt, should be skipped
    // Next slot at 10:00 (08:00 + 120) is 150 min after, should be placed
    expect(result.slots[0]!.localTime).toBe('10:00');
  });
});

describe('Active hours and days', () => {
  it('excludes slots at activeHours.end', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 10,
      startDate: '2026-11-01',
      startTime: '20:00',
      intervalMinutes: 60,
      constraints: {
        ...baseConstraints,
        activeHours: { start: '08:00', end: '22:00' },
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    // 20:00, 21:00 (22:00 is excluded)
    const day1Slots = result.slots.filter(s => s.localDate === '2026-11-01');
    expect(day1Slots).toHaveLength(2);
    expect(day1Slots[0]!.localTime).toBe('20:00');
    expect(day1Slots[1]!.localTime).toBe('21:00');
  });

  it('skips non-active days', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 3,
      startDate: '2026-11-01', // Sunday
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        activeDays: [1, 3, 5], // Mon, Wed, Fri only
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(3);
    // 2026-11-01 is Sunday, should skip to Monday 2026-11-02
    expect(result.slots[0]!.localDate).toBe('2026-11-02');
  });
});

describe('Past slots', () => {
  it('skips slots earlier than now', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 3,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: baseConstraints,
      now: '2026-11-01T11:00:00Z', // After 08:00 and 10:00
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(3);
    expect(result.slots[0]!.localTime).toBe('12:00');
  });
});

describe('Capacity exhaustion', () => {
  it('warns when capacity exhausted within 4 years', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 100000,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 1440, // 1 per day
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 1,
        activeDays: [0], // Sunday only
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots.length).toBeLessThan(100000);
    expect(result.warnings).toContain('capacity exhausted within 4 years');
  });
});

describe('Input validation', () => {
  it('throws on invalid timezone', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 1,
        startDate: '2026-11-01',
        intervalMinutes: 60,
        constraints: { ...baseConstraints, timezone: 'Invalid/Zone' },
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });

  it('throws on invalid startDate', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 1,
        startDate: '2026-13-01',
        intervalMinutes: 60,
        constraints: baseConstraints,
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });

  it('throws on count < 1', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 0,
        startDate: '2026-11-01',
        intervalMinutes: 60,
        constraints: baseConstraints,
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });

  it('throws on empty activeDays', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 1,
        startDate: '2026-11-01',
        intervalMinutes: 60,
        constraints: { ...baseConstraints, activeDays: [] },
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });

  it('throws on activeHours.end <= start', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 1,
        startDate: '2026-11-01',
        intervalMinutes: 60,
        constraints: { ...baseConstraints, activeHours: { start: '22:00', end: '08:00' } },
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });

  it('throws on intervalMinutes < 1 for INTERVAL', () => {
    expect(() =>
      generateSchedule({
        mode: 'INTERVAL',
        count: 1,
        startDate: '2026-11-01',
        intervalMinutes: 0,
        constraints: baseConstraints,
        now: '2026-10-01T00:00:00Z',
      })
    ).toThrow(RangeError);
  });
});

describe('Timezone correctness', () => {
  it('Asia/Makassar (+08:00) converts local 08:00 to UTC 00:00', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 1,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        timezone: 'Asia/Makassar',
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]!.localTime).toBe('08:00');
    expect(result.slots[0]!.scheduledAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('America/New_York DST spring-forward maintains local time', () => {
    // 2026-03-08 is DST spring-forward day in America/New_York
    // Test slots before and after DST transition
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 2,
      startDate: '2026-03-07',
      startTime: '08:00',
      intervalMinutes: 1440, // 1 per day
      constraints: {
        ...baseConstraints,
        timezone: 'America/New_York',
      },
      now: '2026-01-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    expect(result.slots).toHaveLength(2);
    // Both should have local time 08:00
    expect(result.slots[0]!.localTime).toBe('08:00');
    expect(result.slots[0]!.localDate).toBe('2026-03-07');
    expect(result.slots[1]!.localTime).toBe('08:00');
    expect(result.slots[1]!.localDate).toBe('2026-03-08');

    // UTC offsets should differ by 1 hour due to DST
    // 2026-03-07 is EST (UTC-5), 2026-03-08 08:00 is EDT (UTC-4) after transition
    const utc0 = new Date(result.slots[0]!.scheduledAt);
    const utc1 = new Date(result.slots[1]!.scheduledAt);
    const diffHours = (utc1.getTime() - utc0.getTime()) / (1000 * 60 * 60);
    // 1 day = 24 hours, but DST spring-forward removes 1 hour = 23 hours
    expect(Math.abs(diffHours - 23)).toBeLessThan(0.1);
  });
});

describe('Per-account vs global cap', () => {
  it('respects both per-account and global limits', () => {
    const input: GenerateScheduleInput = {
      mode: 'INTERVAL',
      count: 10,
      startDate: '2026-11-01',
      startTime: '08:00',
      intervalMinutes: 120,
      constraints: {
        ...baseConstraints,
        dailyPostingLimit: 10,
        perAccountDailyLimit: 3,
        globalDailyLimit: 4,
      },
      occupancy: {
        perAccountDayCounts: { '2026-11-01': 1 },
        globalDayCounts: { '2026-11-01': 2 },
      },
      now: '2026-10-01T00:00:00Z',
    };

    const result = generateSchedule(input);

    // Day 1: perAccount cap = 3-1=2, global cap = 4-2=2, so min(10, 2, 2) = 2
    const day1Slots = result.slots.filter(s => s.localDate === '2026-11-01');
    expect(day1Slots).toHaveLength(2);

    // Day 2: no occupancy, so perAccount cap = 3, global cap = 4, so min(10, 3, 4) = 3
    const day2Slots = result.slots.filter(s => s.localDate === '2026-11-02');
    expect(day2Slots).toHaveLength(3);
  });
});
