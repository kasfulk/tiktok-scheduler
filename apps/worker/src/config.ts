import { createTikTokClient, type TikTokClient } from '@tiktok-scheduler/tiktok';

export function tiktokMode(): 'mock' | 'live' {
  return process.env.TIKTOK_API_MODE === 'live' ? 'live' : 'mock';
}

export function createClient(): TikTokClient {
  return createTikTokClient({
    mode: tiktokMode(),
    baseUrl: process.env.TIKTOK_API_BASE_URL ?? 'https://open.tiktokapis.com',
    clientKey: process.env.TIKTOK_CLIENT_KEY ?? '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI ?? `${process.env.APP_URL ?? 'http://localhost:3000'}/api/tiktok/callback`,
  });
}

export function workerId(): string {
  return `${process.env.HOSTNAME ?? 'worker'}-${process.pid}`;
}

export function workerConcurrency(): number {
  const value = Number.parseInt(process.env.WORKER_CONCURRENCY ?? '2', 10);
  return Number.isFinite(value) && value > 0 ? value : 2;
}

export function publishTimeoutMs(): number {
  const value = Number.parseInt(process.env.PUBLISH_JOB_TIMEOUT_MS ?? '600000', 10);
  return Number.isFinite(value) && value > 0 ? value : 600_000;
}

export function maxRetries(): number {
  const value = Number.parseInt(process.env.PUBLISH_MAX_RETRIES ?? '3', 10);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

export function scanIntervalMs(): number {
  const value = Number.parseInt(process.env.SCHEDULE_SCAN_INTERVAL_MS ?? '30000', 10);
  return Number.isFinite(value) && value > 5_000 ? value : 30_000;
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
}