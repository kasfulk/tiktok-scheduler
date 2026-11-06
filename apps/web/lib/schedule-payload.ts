import { isValidLocalTime, timeToMinutes } from '@tiktok-scheduler/shared';

export type GenerateMode = 'INTERVAL' | 'FIXED_TIME' | 'SMART';

export interface GenerateScheduleForm {
  videoIds: string[];
  accountId: string;
  mode: GenerateMode;
  startDate: string;
  startTime: string;
  intervalMinutes: number;
  postingTimes: string[];
  activeDays: number[];
  activeHoursStart: string;
  activeHoursEnd: string;
  timezone: string;
  publishMethod: 'DIRECT_POST' | 'UPLOAD_DRAFT';
}

export interface GenerateScheduleBody {
  videoIds: string[];
  accountId: string;
  schedulingMode: GenerateMode;
  startDate: string;
  startTime?: string;
  intervalMinutes?: number;
  postingTimes?: string[];
  activeDays: number[];
  activeHoursStart: string;
  activeHoursEnd: string;
  timezone: string;
  publishMethod: 'DIRECT_POST' | 'UPLOAD_DRAFT';
}

export type BuildGenerateScheduleBody =
  | { ok: true; body: GenerateScheduleBody }
  | { ok: false; error: string };

/**
 * Build the `/api/schedules/generate` payload. INTERVAL and SMART are anchored at `startTime`, so
 * that field (and the interval SMART needs) must be sent — otherwise the plan silently starts at the
 * active-hours boundary instead of the requested hour. FIXED_TIME is anchored by `postingTimes`.
 */
export function buildGenerateScheduleBody(form: GenerateScheduleForm): BuildGenerateScheduleBody {
  const activeStartMin = timeToMinutes(form.activeHoursStart);
  const activeEndMin = timeToMinutes(form.activeHoursEnd);
  const anchoredByStartTime = form.mode !== 'FIXED_TIME';

  if (anchoredByStartTime) {
    if (!isValidLocalTime(form.startTime)) return { ok: false, error: 'Start time must be a valid HH:mm time' };
    const startMin = timeToMinutes(form.startTime);
    if (startMin < activeStartMin || startMin >= activeEndMin) {
      return { ok: false, error: 'Start time must be inside the active hours' };
    }
  }
  if (form.mode === 'FIXED_TIME') {
    if (form.postingTimes.length === 0) return { ok: false, error: 'Add at least one posting time' };
    if (!form.postingTimes.every(isValidLocalTime)) {
      return { ok: false, error: 'Posting times must be valid HH:mm times' };
    }
    if (!form.postingTimes.every((t) => timeToMinutes(t) >= activeStartMin && timeToMinutes(t) < activeEndMin)) {
      return { ok: false, error: 'Posting times must be inside the active hours' };
    }
  }

  return {
    ok: true,
    body: {
      videoIds: form.videoIds,
      accountId: form.accountId,
      schedulingMode: form.mode,
      startDate: form.startDate,
      ...(anchoredByStartTime ? { startTime: form.startTime, intervalMinutes: form.intervalMinutes } : {}),
      ...(form.mode === 'FIXED_TIME' ? { postingTimes: form.postingTimes } : {}),
      activeDays: form.activeDays,
      activeHoursStart: form.activeHoursStart,
      activeHoursEnd: form.activeHoursEnd,
      timezone: form.timezone,
      publishMethod: form.publishMethod,
    },
  };
}
