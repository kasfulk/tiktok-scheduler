/**
 * One-off maintenance: move queued posts from one local posting slot to another.
 *
 *   npx tsx scripts/move-posting-slots.ts 08:00=11:00 10:00=15:00 12:00=19:00 [--dry]
 *
 * Goes through `massReschedulePosts` (the same code path as POST /api/schedules/bulk-reschedule)
 * so BullMQ publish jobs are re-armed and SCHEDULE_CHANGED logs/notifications are written.
 */
import { disconnect, massReschedulePosts, prisma, ready } from '@tiktok-scheduler/db';
import { formatLocalTime } from '@tiktok-scheduler/shared';

const dryRun = process.argv.includes('--dry');
const pairs = process.argv
  .slice(2)
  .filter((arg) => arg.includes('='))
  .map((arg) => {
    const [from, to] = arg.split('=');
    return { from: from!.trim(), to: to!.trim() };
  });

if (pairs.length === 0) {
  console.error('usage: tsx scripts/move-posting-slots.ts FROM=TO [...] [--dry]');
  process.exit(1);
}

async function main() {
  await ready();
  const user = await prisma.user.findFirstOrThrow({ select: { id: true, timezone: true } });

  const queued = await prisma.scheduledPost.findMany({
    where: { account: { userId: user.id }, status: { in: ['PENDING', 'QUEUED'] } },
    select: { id: true, scheduledAt: true, timezone: true },
  });

  for (const { from, to } of pairs) {
    const ids = queued
      .filter((post) => formatLocalTime(post.scheduledAt, post.timezone || user.timezone) === from)
      .map((post) => post.id);

    if (ids.length === 0) {
      console.log(`${from} -> ${to}: nothing queued`);
      continue;
    }
    if (dryRun) {
      console.log(`${from} -> ${to}: would move ${ids.length} post(s)`);
      continue;
    }
    const result = await massReschedulePosts({
      userId: user.id,
      postIds: ids,
      mode: 'TIME',
      value: to,
      fallbackTimezone: user.timezone,
    });
    console.log(`${from} -> ${to}: updated ${result.updated}, staggered ${result.staggered}`, result.skipped);
  }

  await disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
