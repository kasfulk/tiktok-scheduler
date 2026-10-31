import { prisma, SchedulingError, createScheduleBatch } from '@tiktok-scheduler/db';
import { acquireLock } from '@tiktok-scheduler/queue';
import { generateScheduleSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';
import { postToDto } from '@/lib/dto';
import type { GenerateScheduleResult } from '@/lib/types';

export const maxDuration = 60;

export const POST = route(
  async ({ request, user }) => {
    const input = await parseBody(request, generateScheduleSchema);

    // Serialise planning per user: two concurrent generations could otherwise both spend the same
    // remaining capacity on the same local day.
    const release = await acquireLock(`schedule:${user.id}`, 30_000).catch(() => null);
    if (!release) {
      throw new ApiError(409, 'SCHEDULING_BUSY', 'Another scheduling request is running; try again in a moment');
    }

    try {
      const created = await createScheduleBatch({
        userId: user.id,
        accountId: input.accountId,
        videoIds: input.videoIds,
        ...(input.name ? { name: input.name } : {}),
        mode: input.schedulingMode,
        startDate: input.startDate,
        ...(input.startTime ? { startTime: input.startTime } : {}),
        ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
        ...(input.postingTimes ? { postingTimes: input.postingTimes } : {}),
        ...(input.customSlots ? { customSlots: input.customSlots } : {}),
        dailyPostingLimit: input.dailyPostingLimit,
        activeDays: input.activeDays,
        activeHours: { start: input.activeHoursStart, end: input.activeHoursEnd },
        timezone: input.timezone,
        publishMethod: input.publishMethod,
        privacyLevel: input.privacyLevel,
        now: input.now ? new Date(input.now) : new Date(),
      });

      const rows = await prisma.scheduledPost.findMany({
        where: { id: { in: created.postIds } },
        orderBy: { scheduledAt: 'asc' },
        include: {
          video: { select: { id: true, title: true, thumbnailKey: true, duration: true } },
          account: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });

      const body: GenerateScheduleResult = {
        batch: {
          id: created.batch.id,
          name: created.batch.name,
          schedulingMode: created.batch.schedulingMode,
          scheduledCount: created.batch.scheduledCount,
          createdAt: created.batch.createdAt.toISOString(),
        },
        posts: rows.map((row) => postToDto(row, input.timezone)),
        unscheduled: created.unscheduled,
        warnings: created.warnings,
      };
      return ok(body, { status: 201 });
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw new ApiError(409, error.code, error.message, error.details);
      }
      throw error;
    } finally {
      await release();
    }
  },
  { rateLimit: 30 },
);

