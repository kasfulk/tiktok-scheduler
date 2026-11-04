import type { ApiResponse } from '@tiktok-scheduler/shared';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit;
}

/** Typed fetch against the app's REST API; throws `ApiClientError` on `{ error }` envelopes. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const response = await fetch(path.startsWith('/') ? path : `/${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  });

  const text = await response.text();
  let parsed: ApiResponse<T> | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (parsed && 'error' in parsed) {
      throw new ApiClientError(response.status, parsed.error.code, parsed.error.message, parsed.error.details);
    }
    throw new ApiClientError(response.status, 'HTTP_ERROR', text.slice(0, 300) || response.statusText);
  }

  if (!parsed || !('data' in parsed)) {
    throw new ApiClientError(response.status, 'INVALID_RESPONSE', 'The server returned an unexpected payload');
  }
  return parsed.data;
}

/** Shared TanStack Query keys so invalidation stays in one place. */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  activity: (days: number) => ['activity', days] as const,
  upcoming: (limit: number) => ['upcoming', limit] as const,
  me: ['me'] as const,
  videos: (params: Record<string, unknown> = {}) => ['videos', params] as const,
  video: (id: string) => ['video', id] as const,
  schedules: (params: Record<string, unknown> = {}) => ['schedules', params] as const,
  queue: ['queue'] as const,
  accounts: ['accounts'] as const,
  accountSettings: (id: string) => ['account-settings', id] as const,
  postingSettings: ['posting-settings'] as const,
  generalSettings: ['general-settings'] as const,
  notifications: (unreadOnly: boolean) => ['notifications', unreadOnly] as const,
  publishingHistory: (params: Record<string, unknown> = {}) => ['publishing-history', params] as const,
  captionTemplates: ['caption-templates'] as const,
  aiSettings: ['ai-settings'] as const,
};