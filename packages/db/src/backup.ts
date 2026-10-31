import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { log } from '@tiktok-scheduler/shared';
import { repositoryRoot } from '@tiktok-scheduler/shared/paths';
import { prisma } from './client';

const BACKUP_PREFIX = 'tiktok-scheduler-';
const BACKUP_RETAIN = Number.parseInt(process.env.BACKUP_RETAIN ?? '7', 10);
const BACKUP_INTERVAL_HOURS = Number.parseInt(process.env.BACKUP_INTERVAL_HOURS ?? '24', 10);

export function databaseFilePath(): string | null {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) return null;
  const raw = url.slice('file:'.length);
  return path.isAbsolute(raw) ? raw : path.resolve(repositoryRoot(), 'prisma', raw);
}

export function backupDirectory(): string | null {
  const dbFile = databaseFilePath();
  return dbFile ? path.join(path.dirname(dbFile), 'backups') : null;
}

/**
 * Copy the database with `VACUUM INTO` — a consistent snapshot while the worker keeps writing,
 * unlike copying the file next to an open WAL. Keeps the last BACKUP_RETAIN daily snapshots.
 */
export async function backupDatabase(): Promise<string | null> {
  const dir = backupDirectory();
  if (!dir) {
    log('warn', 'backup_skipped', { reason: 'DATABASE_URL is not a local file' });
    return null;
  }

  await mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(dir, `${BACKUP_PREFIX}${today}.db`);
  // A zero-byte file means an earlier VACUUM INTO died mid-write; redo it instead of trusting it.
  const existing = await stat(target).catch(() => null);
  if (existing && existing.size > 0) return null;

  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const files = (await readdir(dir)).filter((file) => file.startsWith(BACKUP_PREFIX)).sort();
  while (files.length > Math.max(1, BACKUP_RETAIN)) {
    const oldest = files.shift();
    if (oldest) await unlink(path.join(dir, oldest)).catch(() => undefined);
  }

  log('info', 'database_backed_up', { target });
  return target;
}

/** Daily backup driven by the worker's maintenance tick. */
export async function maybeBackupDatabase(): Promise<void> {
  const dir = backupDirectory();
  if (!dir) return;

  const files = await readdir(dir).catch(() => [] as string[]);
  const newest = files.filter((file) => file.startsWith(BACKUP_PREFIX)).sort().pop();
  if (newest) {
    const stats = await stat(path.join(dir, newest));
    const ageHours = (Date.now() - stats.mtimeMs) / 3_600_000;
    if (ageHours < BACKUP_INTERVAL_HOURS) return;
  }

  await backupDatabase().catch((error: unknown) => {
    log('error', 'backup_failed', { error: error instanceof Error ? error.message : String(error) });
  });
}