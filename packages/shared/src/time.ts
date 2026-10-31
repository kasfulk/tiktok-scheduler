/**
 * Timezone helpers built on `Intl` only — no date library.
 *
 * Every schedule is authored as local wall-clock time in an IANA zone and stored as a UTC
 * instant. `zonedTimeToUtc` therefore has to survive DST: a local time may be nonexistent
 * (spring forward) or ambiguous (fall back).
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  partsCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }
}

/** Wall-clock fields of `instant` in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  assertValidTimeZone(timeZone);
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return value === undefined ? Number.NaN : Number.parseInt(value, 10);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** UTC offset of `timeZone` at `instant`, in minutes east of UTC (Asia/Makassar = 480). */
export function getOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `YYYY-MM-DD` of `instant` in `timeZone`. */
export function formatLocalDate(instant: Date | string, timeZone: string): string {
  const parts = getZonedParts(toDate(instant), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** `HH:mm` of `instant` in `timeZone`. */
export function formatLocalTime(instant: Date | string, timeZone: string): string {
  const parts = getZonedParts(toDate(instant), timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date value: ${String(value)}`);
  return date;
}

/** Convert local wall-clock fields in `timeZone` to the corresponding UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  assertValidTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = getOffsetMinutes(new Date(guess), timeZone);
  const firstCandidate = guess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstCandidate), timeZone);

  const candidates = [firstCandidate];
  if (secondOffset !== firstOffset) {
    candidates.push(guess - secondOffset * 60_000);
  }

  const exact = candidates.filter((candidate) => sameWallClock(candidate, year, month, day, hour, minute, timeZone));
  if (exact.length > 0) {
    // Ambiguous local time (fall back): the earliest instant is the pre-transition one.
    return new Date(Math.min(...exact));
  }

  // Nonexistent local time (spring forward): roll forward by the gap.
  const later = candidates
    .map((candidate) => ({ candidate, parts: getZonedParts(new Date(candidate), timeZone) }))
    .filter(({ parts }) => compareWallClock(parts, { year, month, day, hour, minute, second: 0 }) > 0)
    .sort((a, b) => compareWallClock(a.parts, b.parts));
  const chosen = later[0]?.candidate ?? Math.max(...candidates);
  return new Date(chosen);
}

function sameWallClock(
  instantMs: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): boolean {
  const parts = getZonedParts(new Date(instantMs), timeZone);
  return (
    parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute
  );
}

function compareWallClock(a: ZonedParts, b: ZonedParts): number {
  return (
    Date.UTC(a.year, a.month - 1, a.day, a.hour, a.minute) - Date.UTC(b.year, b.month - 1, b.day, b.hour, b.minute)
  );
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function isValidLocalTime(value: string): boolean {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [, h, m] = match;
  return Number(h) <= 23 && Number(m) <= 59;
}

/** `"08:30"` → 510. Throws on malformed input so bad settings fail loudly. */
export function timeToMinutes(value: string): number {
  if (!isValidLocalTime(value)) throw new RangeError(`Invalid local time: ${value}`);
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseLocalDate(value: string): LocalDateParts {
  if (!isValidLocalDate(value)) throw new RangeError(`Invalid local date: ${value}`);
  const [year, month, day] = value.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** `YYYY-MM-DD` + n days, calendar-correct across months and leap years. */
export function addLocalDays(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday for a local date string. */
export function localDayOfWeek(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Start-of-day instant for a local date in `timeZone`. */
export function startOfLocalDayUtc(localDate: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(localDate);
  return zonedTimeToUtc(year, month, day, 0, 0, timeZone);
}

export function endOfLocalDayUtc(localDate: string, timeZone: string): Date {
  const next = addLocalDays(localDate, 1);
  const { year, month, day } = parseLocalDate(next);
  return new Date(zonedTimeToUtc(year, month, day, 0, 0, timeZone).getTime() - 1);
}

/** Parse `YYYY-MM-DD` + `HH:mm` in `timeZone` into a UTC instant. */
export function localDateTimeToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(localDate);
  const minutes = timeToMinutes(localTime);
  return zonedTimeToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60, timeZone);
}