import { SchedulingError, massReschedulePosts } from '@tiktok-scheduler/db';
import { massRescheduleSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';

/** Bulk wall-clock edit: set only the time, or only the date, of many queued posts. */
export const POST = route(async ({ request, user }) => {
  const input = await parseBody(request, massRescheduleSchema);

  try {
    const result = await massReschedulePosts({
      userId: user.id,
      postIds: input.postIds,
      mode: input.mode,
      value: input.mode === 'TIME' ? input.time : input.date,
      fallbackTimezone: user.timezone,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof SchedulingError) throw new ApiError(409, error.code, error.message, error.details);
    throw error;
  }
});
