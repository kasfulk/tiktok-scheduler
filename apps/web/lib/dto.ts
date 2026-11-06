import type { AccountDto, ScheduledPostDto, VideoDto, PostingSettingsDto, AccountPostingSettingsDto } from './types';
import { parseActiveDays, formatLocalDate, formatLocalTime, type PublishMethod, type ScheduledPostStatus, type VideoStatus } from '@tiktok-scheduler/shared';

/** Row shapes as selected by the API routes (structural, so Prisma subsets fit). */

export interface VideoRow {
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
  status: string;
  processingError: string | null;
  storageKey: string;
  thumbnailKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  scheduledPosts?: Array<{
    id: string;
    scheduledAt: Date;
    status: string;
    accountId: string;
    account: { username: string };
  }>;
}

export function videoToDto(video: VideoRow): VideoDto {
  const next = [...(video.scheduledPosts ?? [])]
    .filter((post) => post.status !== 'CANCELLED')
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];

  return {
    id: video.id,
    title: video.title,
    filename: video.filename,
    mimeType: video.mimeType,
    fileSize: video.fileSize,
    duration: video.duration,
    width: video.width,
    height: video.height,
    caption: video.caption,
    hashtags: video.hashtags,
    status: video.status as VideoStatus,
    processingError: video.processingError,
    thumbnailUrl: video.thumbnailKey ? `/api/media/thumbnails/${video.id}` : null,
    streamUrl: `/api/media/videos/${video.id}`,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
    scheduledPost: next
      ? {
          id: next.id,
          scheduledAt: next.scheduledAt.toISOString(),
          status: next.status as ScheduledPostStatus,
          accountId: next.accountId,
          accountUsername: next.account.username,
        }
      : null,
  };
}

export interface AccountRow {
  id: string;
  openId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  connectionStatus: string;
  authMode: string;
  isDefault: boolean;
  scopes: string;
  tokenExpiresAt: Date | null;
  createdAt: Date;
}

export function accountToDto(account: AccountRow): AccountDto {
  return {
    id: account.id,
    openId: account.openId,
    username: account.username,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    connectionStatus: account.connectionStatus as AccountDto['connectionStatus'],
    authMode: (account.authMode === 'BROWSER' ? 'BROWSER' : 'OAUTH') as AccountDto['authMode'],
    isDefault: account.isDefault,
    scopes: account.scopes ? account.scopes.split(/[\s,]+/).filter(Boolean) : [],
    tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  };
}

export interface ScheduledPostRow {
  id: string;
  videoId: string;
  accountId: string;
  status: string;
  scheduledAt: Date;
  timezone: string;
  retryCount: number;
  maxRetries: number;
  externalPublishId: string | null;
  publishedAt: Date | null;
  errorMessage: string | null;
  publishMethod: string;
  createdAt: Date;
  video: { id: string; title: string; caption: string | null; thumbnailKey: string | null; duration: number };
  account: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

export function postToDto(post: ScheduledPostRow, fallbackTimezone: string): ScheduledPostDto {
  const timezone = post.timezone || fallbackTimezone;
  return {
    id: post.id,
    videoId: post.videoId,
    accountId: post.accountId,
    status: post.status as ScheduledPostStatus,
    scheduledAt: post.scheduledAt.toISOString(),
    localDate: formatLocalDate(post.scheduledAt, timezone),
    localTime: formatLocalTime(post.scheduledAt, timezone),
    timezone,
    retryCount: post.retryCount,
    maxRetries: post.maxRetries,
    externalPublishId: post.externalPublishId,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    errorMessage: post.errorMessage,
    publishMethod: post.publishMethod as PublishMethod,
    createdAt: post.createdAt.toISOString(),
    video: {
      id: post.video.id,
      title: post.video.title,
      caption: post.video.caption,
      thumbnailUrl: post.video.thumbnailKey ? `/api/media/thumbnails/${post.video.id}` : null,
      duration: post.video.duration,
    },
    account: post.account,
  };
}

export interface PostingSettingsRow {
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: string;
  timezone: string;
  defaultSchedulingMode: string;
  updatedAt: Date;
}

export function postingSettingsToDto(settings: PostingSettingsRow): PostingSettingsDto {
  return {
    minimumIntervalMinutes: settings.minimumIntervalMinutes,
    activeHoursStart: settings.activeHoursStart,
    activeHoursEnd: settings.activeHoursEnd,
    activeDays: parseActiveDays(settings.activeDays),
    timezone: settings.timezone,
    defaultSchedulingMode: settings.defaultSchedulingMode as PostingSettingsDto['defaultSchedulingMode'],
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export function accountPostingSettingsToDto(settings: {
  accountId: string;
  enabled: boolean;
  minimumIntervalMinutes: number;
  activeHoursStart: string;
  activeHoursEnd: string;
  activeDays: string;
  timezone: string;
}): AccountPostingSettingsDto {
  return {
    accountId: settings.accountId,
    enabled: settings.enabled,
    minimumIntervalMinutes: settings.minimumIntervalMinutes,
    activeHoursStart: settings.activeHoursStart,
    activeHoursEnd: settings.activeHoursEnd,
    activeDays: parseActiveDays(settings.activeDays),
    timezone: settings.timezone,
  };
}