import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __tiktokSchedulerPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__tiktokSchedulerPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__tiktokSchedulerPrisma = prisma;
}

let pragmasReady: Promise<void> | null = null;

/**
 * Apply SQLite pragmas once per process. `journal_mode` is persistent in the file; the others are
 * per-connection and are re-applied on every process start (see SYSTEM_DESIGN.md §3).
 */
export function ready(): Promise<void> {
  pragmasReady ??= applyPragmas().catch((error: unknown) => {
    pragmasReady = null;
    throw error;
  });
  return pragmasReady;
}

async function applyPragmas(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  // PRAGMA statements that return a row must go through $queryRaw; SQLite rejects them on execute.
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];