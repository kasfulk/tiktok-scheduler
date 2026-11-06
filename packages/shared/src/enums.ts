/** Canonical enumerations. SQLite has no enum type, so these lists are the source of truth. */

export const VIDEO_STATUSES = [
  'DRAFT',
  'READY',
  'SCHEDULED',
  'UPLOADING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const SCHEDULED_POST_STATUSES = [
  'PENDING',
  'QUEUED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'MANUAL_ACTION_REQUIRED',
] as const;
export type ScheduledPostStatus = (typeof SCHEDULED_POST_STATUSES)[number];

/** Posts in these states can still be re-planned; everything else is immutable. */
export const RE_PLANNABLE_STATUSES: readonly ScheduledPostStatus[] = ['PENDING', 'QUEUED'];

/** Posts in these states consume daily capacity. */
export const CAPACITY_CONSUMING_STATUSES: readonly ScheduledPostStatus[] = [
  'PENDING',
  'QUEUED',
  'PUBLISHING',
  'PUBLISHED',
  'MANUAL_ACTION_REQUIRED',
];

export const SCHEDULING_MODES = ['INTERVAL', 'FIXED_TIME', 'CUSTOM', 'SMART'] as const;
export type SchedulingMode = (typeof SCHEDULING_MODES)[number];

export const CONNECTION_STATUSES = ['CONNECTED', 'EXPIRED', 'DISCONNECTED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const PUBLISH_METHODS = ['DIRECT_POST', 'UPLOAD_DRAFT'] as const;
export type PublishMethod = (typeof PUBLISH_METHODS)[number];

export const NOTIFICATION_TYPES = [
  'PUBLISH_SUCCESS',
  'PUBLISH_FAILED',
  'TOKEN_EXPIRED',
  'ACCOUNT_DISCONNECTED',
  'MANUAL_ACTION_REQUIRED',
  'SCHEDULE_CHANGED',
  'QUEUE_COMPLETED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

/** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay()` and `activeDays` CSV storage. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const TIKTOK_CAPTION_MAX_LENGTH = 2200;
export const TIKTOK_MAX_HASHTAGS = 30;

export const DEFAULT_ACTIVE_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function isVideoStatus(value: unknown): value is VideoStatus {
  return typeof value === 'string' && (VIDEO_STATUSES as readonly string[]).includes(value);
}

export function isScheduledPostStatus(value: unknown): value is ScheduledPostStatus {
  return typeof value === 'string' && (SCHEDULED_POST_STATUSES as readonly string[]).includes(value);
}

export function isSchedulingMode(value: unknown): value is SchedulingMode {
  return typeof value === 'string' && (SCHEDULING_MODES as readonly string[]).includes(value);
}

export function parseActiveDays(csv: string | null | undefined): number[] {
  if (!csv) return [...DEFAULT_ACTIVE_DAYS];
  const days = csv
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_ACTIVE_DAYS];
}

export function serializeActiveDays(days: readonly number[]): string {
  return [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b).join(',');
}