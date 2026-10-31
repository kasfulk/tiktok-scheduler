import { prisma, ready } from '@tiktok-scheduler/db';
import { queueSnapshot } from '@tiktok-scheduler/queue';
import type { HealthResponse } from '@/lib/types';
import { ok, route } from '@/lib/api';
import { redisClient } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const GET = route(
  async () => {
    const checks: Record<string, string> = {};
    let database = true;
    let redis = true;

    try {
      await ready();
      await prisma.$queryRawUnsafe('SELECT 1');
      checks.database = 'ok';
    } catch (error) {
      database = false;
      checks.database = error instanceof Error ? error.message : 'unavailable';
    }

    try {
      await redisClient().ping();
      checks.redis = 'ok';
    } catch (error) {
      redis = false;
      checks.redis = error instanceof Error ? error.message : 'unavailable';
    }

    let queuePaused = false;
    try {
      const snapshot = await queueSnapshot();
      queuePaused = snapshot.paused;
      checks.queue = `active=${snapshot.counts.active} waiting=${snapshot.counts.waiting} delayed=${snapshot.counts.delayed}`;
    } catch (error) {
      checks.queue = error instanceof Error ? error.message : 'unavailable';
    }

    const body: HealthResponse = {
      status: database && redis ? 'ok' : 'degraded',
      database,
      redis,
      queuePaused,
      tiktokMode: process.env.TIKTOK_API_MODE ?? 'mock',
      checks,
      time: new Date().toISOString(),
    };
    return ok(body, { status: body.status === 'ok' ? 200 : 503 });
  },
  { public: true, rateLimit: 300 },
);