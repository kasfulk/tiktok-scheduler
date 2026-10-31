import {
  disconnect,
  ready,
  replanUserPendingPosts,
} from '@tiktok-scheduler/db';
import { ensureStorageDirs } from '@tiktok-scheduler/media';
import {
  MAINTENANCE_QUEUE,
  PROCESS_VIDEO_QUEUE,
  PUBLISH_QUEUE,
  closeRedisConnections,
  createRedisConnection,
  maintenanceQueue,
  type MaintenanceJobData,
  type ProcessVideoJobData,
  type PublishJobData,
} from '@tiktok-scheduler/queue';
import { log } from '@tiktok-scheduler/shared';
import { startMockTikTokServer, type MockTikTokServerHandle } from '@tiktok-scheduler/tiktok';
import { Worker } from 'bullmq';
import { publishTimeoutMs, scanIntervalMs, tiktokMode, workerConcurrency, workerId } from './config.js';
import { recoverStaleClaims, runMaintenance, sweepDuePosts } from './maintenance.js';
import { processVideo } from './process-video.js';
import { publishPost } from './publish.js';

const WORKER_ID = workerId();
const workers: Worker[] = [];
let heartbeat: NodeJS.Timeout | undefined;
let shuttingDown = false;
let mockServer: MockTikTokServerHandle | undefined;

async function bootstrap(): Promise<void> {
  await ready();
  await ensureStorageDirs();

  // Mock mode never touches the network: the worker hosts the fake TikTok API itself.
  if (tiktokMode() === 'mock') {
    mockServer = await startMockTikTokServer();
    process.env.TIKTOK_API_BASE_URL = mockServer.url;
    log('info', 'tiktok_mock_server_started', { url: mockServer.url });
  }

  const publishWorker = new Worker<PublishJobData>(
    PUBLISH_QUEUE,
    async (job) => {
      const outcome = await publishPost({ postId: job.data.postId, workerId: WORKER_ID });
      log('info', 'publish_job_finished', { postId: job.data.postId, outcome });
      return { outcome };
    },
    {
      connection: createRedisConnection('worker-publish'),
      concurrency: workerConcurrency(),
      lockDuration: publishTimeoutMs() + 60_000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  const videoWorker = new Worker<ProcessVideoJobData>(
    PROCESS_VIDEO_QUEUE,
    async (job) => processVideo(job.data.videoId),
    { connection: createRedisConnection('worker-video'), concurrency: 2 },
  );

  const maintenanceWorker = new Worker<MaintenanceJobData>(
    MAINTENANCE_QUEUE,
    async (job) => {
      switch (job.data.kind) {
        case 'replan-user': {
          const result = await replanUserPendingPosts(job.data.userId);
          return result;
        }
        case 'recover':
          return recoverStaleClaims();
        case 'enqueue-due':
        default:
          return runMaintenance();
      }
    },
    { connection: createRedisConnection('worker-maintenance'), concurrency: 1 },
  );

  for (const worker of [publishWorker, videoWorker, maintenanceWorker]) {
    worker.on('failed', (job, error) => {
      log('error', 'worker_job_failed', {
        queue: worker.name,
        jobId: job?.id,
        error: error.message,
      });
    });
    worker.on('error', (error) => log('error', 'worker_error', { queue: worker.name, error: error.message }));
    workers.push(worker);
  }

  // Periodic reconciliation between SQLite (truth) and Redis (transport).
  await maintenanceQueue().upsertJobScheduler(
    'maintenance-tick',
    { every: scanIntervalMs() },
    { name: 'tick', data: { kind: 'enqueue-due' }, opts: { removeOnComplete: { count: 10 }, removeOnFail: { count: 10 } } },
  );

  await maintenanceQueue().add('recover', { kind: 'recover' }, { jobId: `recover-${Date.now()}` });
  await sweepDuePosts();

  heartbeat = setInterval(() => {
    void writeHeartbeat();
  }, 10_000);
  await writeHeartbeat();

  log('info', 'worker_started', {
    workerId: WORKER_ID,
    concurrency: workerConcurrency(),
    scanIntervalMs: scanIntervalMs(),
    tiktokMode: process.env.TIKTOK_API_MODE ?? 'mock',
  });
}

async function writeHeartbeat(): Promise<void> {
  try {
    await createRedisConnection('heartbeat').set(
      'worker:heartbeat',
      JSON.stringify({ workerId: WORKER_ID, at: new Date().toISOString(), concurrency: workerConcurrency() }),
      'EX',
      90,
    );
  } catch (error) {
    log('warn', 'heartbeat_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'worker_shutdown', { signal });

  clearInterval(heartbeat);
  // Close workers first: in-flight jobs finish, then the Redis connections can go.
  await Promise.all(workers.map((worker) => worker.close().catch(() => undefined)));
  await closeRedisConnections();
  await mockServer?.close();
  await disconnect();
  log('info', 'worker_stopped', { workerId: WORKER_ID });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { error: reason instanceof Error ? reason.message : String(reason) });
});

bootstrap().catch((error: unknown) => {
  log('error', 'worker_bootstrap_failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});