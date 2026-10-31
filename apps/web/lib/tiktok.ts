import { createTikTokClient, type TikTokClient } from '@tiktok-scheduler/tiktok';

export function tiktokMode(): 'mock' | 'live' {
  return process.env.TIKTOK_API_MODE === 'live' ? 'live' : 'mock';
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function tiktokClient(): TikTokClient {
  return createTikTokClient({
    mode: tiktokMode(),
    baseUrl: process.env.TIKTOK_API_BASE_URL ?? 'https://open.tiktokapis.com',
    clientKey: process.env.TIKTOK_CLIENT_KEY ?? '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI ?? `${appUrl()}/api/tiktok/callback`,
  });
}

/** Live mode without an approved app cannot call TikTok; surface it as one clear message. */
export function assertLiveCredentials(): void {
  if (tiktokMode() === 'live' && (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET)) {
    throw new Error('TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are required in live mode');
  }
}