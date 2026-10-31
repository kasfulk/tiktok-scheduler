import { Queue, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';

export const PUBLISH_QUEUE = 'publish';
export const PROCESS_VIDEO_QUEUE = 'process-video';
export const MAINTENANCE_QUEUE = 'maintenance';
export const DEAD_LETTER_QUEUE = 'dead-letter';

export interface PublishJobData {
  postId: string;
}

export interface ProcessVideoJobData {
  videoId: string;
}

export type MaintenanceJobData =
  | { kind: 'replan-user'; userId: string }
  | { kind: 'enqueue-due' }
  | { kind: 'recover' };

export function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
}

const globalForQueues = globalThis as unknown as {
  __ttsConnections?: Map<string, Redis>;
  __ttsQueues?: Map<string, Queue>;
};

function connections(): Map<string, Redis> {
  globalForQueues.__ttsConnections ??= new Map();
  return globalForQueues.__ttsConnections;
}

/** ioredis connection tuned for BullMQ (it requires `maxRetriesPerRequest: null`). */
export function createRedisConnection(role = 'shared'): Redis {
  const cache = connections();
  const existing = cache.get(role);
  if (existing) return existing;
  const connection = new Redis(redisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectionName: `tts-${role}`,
  });
  cache.set(role, connection);
  return connection;
}

export function closeRedisConnections(): Promise<void> {
  const cache = connections();
  const all = [...cache.values()];
  cache.clear();
  globalForQueues.__ttsQueues?.clear();
  return Promise.all(all.map((connection) => connection.quit().catch(() => undefined))).then(() => undefined);
}

function queueFor(name: string): Queue {
  globalForQueues.__ttsQueues ??= new Map();
  const existing = globalForQueues.__ttsQueues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, {
    connection: createRedisConnection(`queue-${name}`),
    defaultJobOptions: {
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: false,
    },
  });
  globalForQueues.__ttsQueues.set(name, queue);
  return queue;
}

export function publishQueue(): Queue<PublishJobData> {
  return queueFor(PUBLISH_QUEUE) as Queue<PublishJobData>;
}

export function processVideoQueue(): Queue<ProcessVideoJobData> {
  return queueFor(PROCESS_VIDEO_QUEUE) as Queue<ProcessVideoJobData>;
}

export function deadLetterQueue(): Queue {
  return queueFor(DEAD_LETTER_QUEUE);
}

export function maintenanceQueue(): Queue<MaintenanceJobData> {
  return queueFor(MAINTENANCE_QUEUE) as Queue<MaintenanceJobData>;
}

/** Re-plan a user's pending posts after their posting policy changed. */
export async function enqueueReplanUser(userId: string): Promise<void> {
  await maintenanceQueue().add(
    'replan-user',
    { kind: 'replan-user', userId },
    { jobId: `replan-${userId}-${Math.floor(Date.now() / 1000)}`, removeOnComplete: { age: 3600, count: 100 } },
  );
}

/** Ask the worker to sweep SQLite for posts that are due (used after resumes/manual changes). */
export async function enqueueDueSweep(): Promise<void> {
  await maintenanceQueue().add(
    'enqueue-due',
    { kind: 'enqueue-due' },
    { jobId: `enqueue-due-${Math.floor(Date.now() / 1000)}`, removeOnComplete: { age: 3600, count: 20 } },
  );
}

/** BullMQ rejects `:` inside custom job ids — they become Redis key segments. */
export function publishJobId(postId: string): string {
  return `publish-${postId}`;
}

/**
 * Arm (or re-arm) the publish job for a post. BullMQ rejects a duplicate `jobId`, so an existing
 * job is removed first — that is what keeps rescheduling from creating zombie jobs.
 */
export async function schedulePublishJob(postId: string, runAt: Date): Promise<void> {
  const queue = publishQueue();
  const jobId = publishJobId(postId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active') return; // A worker owns it; do not yank the job mid-publish.
    await existing.remove().catch(() => undefined);
  }
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const options: JobsOptions = {
    jobId,
    delay,
    attempts: 1, // Retries are orchestrated in SQLite so the outcome is never guessed.
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: false,
  };
  await queue.add('publish-post', { postId }, options);
}

export async function cancelPublishJob(postId: string): Promise<void> {
  const queue = publishQueue();
  const job = await queue.getJob(publishJobId(postId));
  if (!job) return;
  const state = await job.getState();
  if (state === 'active') return;
  await job.remove().catch(() => undefined);
}

export async function enqueueProcessVideo(videoId: string): Promise<void> {
  await processVideoQueue().add(
    'process-video',
    { videoId },
    { jobId: `process-video-${videoId}`, attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
  );
}

export async function enqueueDeadLetter(payload: {
  queue: string;
  jobId: string | undefined;
  postId?: string;
  videoId?: string;
  reason: string;
}): Promise<void> {
  await deadLetterQueue().add('failed', payload, { removeOnComplete: false });
}

export interface QueueCounts {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

export async function queueSnapshot(): Promise<{ paused: boolean; counts: QueueCounts }> {
  const queue = publishQueue();
  const [counts, paused] = await Promise.all([queue.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed'), queue.isPaused()]);
  return {
    paused,
    counts: {
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    },
  };
}

export async function setQueuePaused(paused: boolean): Promise<boolean> {
  const queue = publishQueue();
  if (paused) await queue.pause();
  else await queue.resume();
  return queue.isPaused();
}

/**
 * Redis lease. Returns a release function, or null when another process holds the lock —
 * callers must treat null as "someone else is doing it" rather than retrying blindly.
 */
export async function acquireLock(
  key: string,
  ttlMs: number,
  connection: Redis = createRedisConnection('locks'),
): Promise<(() => Promise<void>) | null> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await connection.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') return null;
  return async () => {
    await connection
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        `lock:${key}`,
        token,
      )
      .catch(() => undefined);
  };
}

export async function lockHeld(key: string): Promise<boolean> {
  return (await createRedisConnection('locks').exists(`lock:${key}`)) === 1;
}