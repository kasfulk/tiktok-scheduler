import { log } from '@tiktok-scheduler/shared';
import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { __ttsRedis?: Redis };

function client(): Redis {
  globalForRedis.__ttsRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  globalForRedis.__ttsRedis.on('error', (error: Error) => {
    log('warn', 'redis_error', { error: error.message });
  });
  return globalForRedis.__ttsRedis;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window counter in Redis. Fails open: a Redis outage must not lock the UI out, and the
 * publishing path is protected by database state anyway.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  try {
    const redis = client();
    const namespaced = `ratelimit:${windowSeconds}:${key}`;
    const count = await redis.incr(namespaced);
    if (count === 1) await redis.expire(namespaced, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (error) {
    log('warn', 'rate_limit_unavailable', { error: error instanceof Error ? error.message : String(error) });
    return { allowed: true, remaining: limit };
  }
}

export function redisClient(): Redis {
  return client();
}