import { setQueuePaused } from '@tiktok-scheduler/queue';
import { ok, route } from '@/lib/api';

export const POST = route(async () => {
  const paused = await setQueuePaused(true);
  return ok({ paused });
});