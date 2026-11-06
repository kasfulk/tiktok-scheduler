export * from './enums';
export * from './logger';
export * from './time';
export * from './schemas';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DashboardStats {
  totalVideos: number;
  inQueue: number;
  scheduled: number;
  published: number;
  failed: number;
  draft: number;
  todayPublished: number;
  timezone: string;
}

export interface ActivityPoint {
  date: string;
  published: number;
  failed: number;
}

export interface UpcomingPost {
  id: string;
  videoId: string;
  videoTitle: string;
  thumbnailUrl: string | null;
  accountId: string;
  accountUsername: string;
  scheduledAt: string;
  status: string;
  timezone: string;
}

export interface QueueSummary {
  paused: boolean;
  counts: Record<string, number>;
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

/** Build a TRPC-free typed fetch envelope: every endpoint answers `{ data }` or `{ error }`. */
export type ApiResponse<T> = { data: T } | ApiError;