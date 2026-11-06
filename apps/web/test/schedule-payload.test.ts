import { describe, expect, it } from 'vitest';
import { buildGenerateScheduleBody, type GenerateScheduleForm } from '../lib/schedule-payload';

const base: GenerateScheduleForm = {
  videoIds: ['v1', 'v2'],
  accountId: 'acct',
  mode: 'INTERVAL',
  startDate: '2026-11-06',
  startTime: '14:30',
  intervalMinutes: 90,
  postingTimes: ['19:30'],
  activeDays: [1, 2, 3, 4, 5],
  activeHoursStart: '09:00',
  activeHoursEnd: '22:00',
  timezone: 'Asia/Jakarta',
  publishMethod: 'DIRECT_POST',
};

describe('buildGenerateScheduleBody', () => {
  it('anchors INTERVAL at the requested start time', () => {
    const result = buildGenerateScheduleBody(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.startTime).toBe('14:30');
    expect(result.body.intervalMinutes).toBe(90);
    expect(result.body.postingTimes).toBeUndefined();
  });

  it('sends both start time and interval for SMART', () => {
    const result = buildGenerateScheduleBody({ ...base, mode: 'SMART' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.schedulingMode).toBe('SMART');
    expect(result.body.startTime).toBe('14:30');
    expect(result.body.intervalMinutes).toBe(90);
  });

  it('sends posting times and omits the start time for FIXED_TIME', () => {
    const result = buildGenerateScheduleBody({ ...base, mode: 'FIXED_TIME', postingTimes: ['09:00', '19:30'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.postingTimes).toEqual(['09:00', '19:30']);
    expect(result.body.startTime).toBeUndefined();
    expect(result.body.intervalMinutes).toBeUndefined();
  });

  it('rejects a start time outside the active hours', () => {
    expect(buildGenerateScheduleBody({ ...base, startTime: '23:00' })).toEqual({
      ok: false,
      error: 'Start time must be inside the active hours',
    });
  });

  it('reports a malformed clock instead of throwing', () => {
    expect(buildGenerateScheduleBody({ ...base, startTime: '9:30' })).toEqual({
      ok: false,
      error: 'Start time must be a valid HH:mm time',
    });
  });

  it('rejects posting times outside the active hours', () => {
    const result = buildGenerateScheduleBody({ ...base, mode: 'FIXED_TIME', postingTimes: ['23:00'] });
    expect(result).toEqual({ ok: false, error: 'Posting times must be inside the active hours' });
  });
});
