import type {
  ConnectionStatus,
  LimitScope,
  PublishMethod,
  ScheduledPostStatus,
  SchedulingMode,
  VideoStatus,
} from '@tiktok-scheduler/shared';

/** Wire shapes shared by the REST API and the dashboard. Dates are ISO strings. */

export interface VideoDto {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  caption: string | null;
  hashtags: string | null;
  status: VideoStatus;
  processingError: string | null;
  thumbnailUrl: string | null;
  streamUrl: string;
  createdAt: string;
  updatedAt: string;
  scheduledPost: {
    id: string;
    scheduledAt: string;
    status: ScheduledPostStatus;
    accountId: string;
    accountUsername: string;
  } | null;
}

export interface AccountDto {
  id: string;
  openId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  connectionStatus: ConnectionStatus;
  /** BROWSER = imported from a logged-in browser profile; its cookie jar replaces API tokens. */
  authMode: 'OAUTH' | 'BROWSER';
  isDefault: boolean;
  scopes: string[];
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface ScheduledPostDto {
  id: string;
  videoId: string;
  accountId: string;
  status: ScheduledPostStatus;
  scheduledAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
  retryCount: number;
  maxRetries: number;
  externalPublishId: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  publishMethod: PublishMethod;
  createdAt: string;
  video: { id: string; title: string; caption: string | null; thumbnailUrl: string | null; duration: number };
  account: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export interface ScheduleBatchDto {
  id: string;
  name: string;
  schedulingMode: SchedulingMode;
  scheduledCount: number;
  createdAt: string;
}

export interface GenerateScheduleResult {
  batch: ScheduleBatchDto;
  posts: ScheduledPostDto[];
  unscheduled: number;
  warnings: string[];
}

export interface QueueItemDto {
  id: string;
  videoId: string;
  videoTitle: string;
  thumbnailUrl: string | null;
  /** Raw video caption/hashtags; the worker composes both into the published caption. */
  caption: string | null;
  hashtags: string | null;
  accountUsername: string;
  scheduledAt: string;
  /** Post wall clock in its own timezone — used to prefill the mass reschedule dialog. */
  localDate: string;
  localTime: string;
  status: ScheduledPostStatus;
  retryCount: number;
  errorMessage: string | null;
}

export interface QueueResponse {
  paused: boolean;
  counts: { active: number; waiting: number; delayed: number; completed: number; failed: number };
  items: QueueItemDto[];
}

export interface MassRescheduleResult {
  updated: number;
  staggered: number;
  skipped: Array<{ id: string; code: string; message: string }>;
}

export interface PublishingLogDto {
  id: string;
  event: string;
  scheduledPostId: string;
  errorMessage: string | null;
  requestMetadata: string | null;
  responseMetadata: string | null;
  createdAt: string;
  videoTitle: string | null;
  accountUsername: string | null;
}

export interface PostingSettingsDto {
  enableDailyLimit: boolean;
  dailyPostingLimit: number;
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: number[];
  timezone: string;
  limitScope: LimitScope;
  defaultSchedulingMode: SchedulingMode;
  updatedAt: string;
}

export interface AccountPostingSettingsDto {
  accountId: string;
  enabled: boolean;
  dailyPostingLimit: number;
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: number[];
  timezone: string;
}

export interface GeneralSettingsDto {
  name: string;
  email: string;
  timezone: string;
  defaultAccountId: string | null;
  telegramEnabled: boolean;
  telegramChatId: string | null;
}

export interface AiSettingsDto {
  enabled: boolean;
  baseUrl: string;
  model: string;
  /** The stored key never leaves the server; the UI only learns whether one exists. */
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  /** Effective prompt: the stored prompt, or `defaultPrompt` when none is stored. */
  prompt: string;
  defaultPrompt: string;
}

export interface GenerateCaptionResult {
  caption: string;
  hashtags: string;
  model: string;
}

export interface CaptionTemplateDto {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface SessionUserDto {
  id: string;
  name: string;
  email: string;
  timezone: string;
  defaultAccountId: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  redis: boolean;
  queuePaused: boolean;
  tiktokMode: string;
  checks: Record<string, string>;
  time: string;
}