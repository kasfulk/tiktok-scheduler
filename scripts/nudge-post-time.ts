/** One-off: nudge a single post to a nearby local time (used to de-duplicate a slot). */
import { disconnect, massReschedulePosts, prisma, ready } from '@tiktok-scheduler/db';

async function main() {
  await ready();
  const [postId, time] = process.argv.slice(2);
  if (!postId || !time) {
    console.error('usage: tsx scripts/nudge-post-time.ts <postId> HH:MM');
    process.exit(1);
  }
  const user = await prisma.user.findFirstOrThrow({ select: { id: true, timezone: true } });
  const result = await massReschedulePosts({
    userId: user.id,
    postIds: [postId],
    mode: 'TIME',
    value: time,
    fallbackTimezone: user.timezone,
  });
  console.error(JSON.stringify(result));
  await disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
