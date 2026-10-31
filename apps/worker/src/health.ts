import { disconnect, prisma, ready } from '@tiktok-scheduler/db';
import { createRedisConnection } from '@tiktok-scheduler/queue';
import { log } from '@tiktok-scheduler/shared';

/**
 * Docker/PM2 health probe: exits 0 only when SQLite is queryable, Redis answers and the worker
 * heartbeat is fresh (written every 10 s with a 90 s TTL).
 */
async function main(): Promise<void> {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await ready();
    await prisma.$queryRawUnsafe('SELECT 1');
    checks.database = 'ok';
  } catch (error) {
    healthy = false;
    checks.database = error instanceof Error ? error.message : 'unavailable';
  }

  const redis = createRedisConnection('health');
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (error) {
    healthy = false;
    checks.redis = error instanceof Error ? error.message : 'unavailable';
  }

  try {
    const raw = await redis.get('worker:heartbeat');
    if (!raw) {
      healthy = false;
      checks.heartbeat = 'missing';
    } else {
      const beat = JSON.parse(raw) as { at?: string; workerId?: string };
      const ageMs = beat.at ? Date.now() - new Date(beat.at).getTime() : Number.POSITIVE_INFINITY;
      checks.heartbeat = `ok (${Math.round(ageMs / 1000)}s old, ${beat.workerId ?? 'unknown'})`;
      if (ageMs > 90_000) healthy = false;
    }
  } catch (error) {
    healthy = false;
    checks.heartbeat = error instanceof Error ? error.message : 'unavailable';
  }

  log(healthy ? 'info' : 'error', 'worker_health', { healthy, ...checks });
  await disconnect();
  process.exit(healthy ? 0 : 1);
}

main().catch((error: unknown) => {
  log('error', 'worker_health_crashed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});