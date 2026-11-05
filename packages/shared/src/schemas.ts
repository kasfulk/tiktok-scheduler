import { z } from 'zod';
import {
  CONNECTION_STATUSES,
  LIMIT_SCOPES,
  PRIVACY_LEVELS,
  PUBLISH_METHODS,
  SCHEDULING_MODES,
  SCHEDULED_POST_STATUSES,
  VIDEO_STATUSES,
} from './enums';
import { isValidLocalDate, isValidLocalTime, isValidTimeZone } from './time';

const localDate = z.string().refine(isValidLocalDate, 'Expected a valid YYYY-MM-DD date');
const localTime = z.string().refine(isValidLocalTime, 'Expected a valid HH:mm time');
const timeZone = z.string().refine(isValidTimeZone, 'Expected a valid IANA timezone');
const activeDays = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Select at least one active day')
  .refine((days) => new Set(days).size === days.length, 'Duplicate active days');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  timezone: timeZone.optional(),
});

export const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

export const videoStatusFilterSchema = z.enum(VIDEO_STATUSES);

export const listVideosQuerySchema = z.object({
  status: videoStatusFilterSchema.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(['createdAt', 'title', 'duration', 'fileSize']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const updateVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    caption: z.string().max(2200).nullable().optional(),
    hashtags: z.string().max(600).nullable().optional(),
    status: z.enum(['DRAFT', 'READY', 'CANCELLED']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const bulkVideoIdsSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(500),
});

export const bulkCaptionSchema = bulkVideoIdsSchema.extend({
  captionTemplateId: z.string().min(1).optional(),
  caption: z.string().max(2200).nullable().optional(),
  hashtags: z.string().max(600).nullable().optional(),
  append: z.boolean().default(false),
});

export const captionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2200),
  isDefault: z.boolean().optional(),
});

export const updateCaptionTemplateSchema = captionTemplateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update',
);

const customSlotSchema = z.object({
  date: localDate,
  time: localTime,
});

export const generateScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    videoIds: z.array(z.string().min(1)).min(1).max(500),
    accountId: z.string().min(1),
    schedulingMode: z.enum(SCHEDULING_MODES),
    startDate: localDate,
    startTime: localTime.optional(),
    intervalMinutes: z.number().int().min(5).max(1440).optional(),
    postingTimes: z.array(localTime).min(1).max(48).optional(),
    dailyPostingLimit: z.number().int().min(1).max(100),
    activeDays,
    activeHoursStart: localTime.default('08:00'),
    activeHoursEnd: localTime.default('22:00'),
    timezone: timeZone,
    publishMethod: z.enum(PUBLISH_METHODS).default('DIRECT_POST'),
    privacyLevel: z.enum(PRIVACY_LEVELS).default('PUBLIC_TO_EVERYONE'),
    customSlots: z.array(customSlotSchema).optional(),
    now: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.activeHoursStart >= value.activeHoursEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['activeHoursEnd'],
        message: 'Active hours end must be after active hours start',
      });
    }
    if (value.schedulingMode === 'INTERVAL' && value.intervalMinutes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['intervalMinutes'], message: 'Interval scheduling requires an interval' });
    }
    if (value.schedulingMode === 'FIXED_TIME' && (value.postingTimes?.length ?? 0) === 0) {
      ctx.addIssue({ code: 'custom', path: ['postingTimes'], message: 'Fixed-time scheduling requires posting times' });
    }
    if (value.schedulingMode === 'SMART' && value.intervalMinutes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['intervalMinutes'], message: 'Smart distribution requires an interval' });
    }
    if (value.schedulingMode === 'CUSTOM') {
      const slots = value.customSlots ?? [];
      if (slots.length !== value.videoIds.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['customSlots'],
          message: `Custom scheduling needs exactly one slot per video (${value.videoIds.length})`,
        });
      }
    }
  });

export const reschedulePostSchema = z.object({
  scheduledAt: z.iso.datetime({ offset: true }),
  accountId: z.string().min(1).optional(),
});

export const massRescheduleSchema = z.discriminatedUnion('mode', [
  z.object({
    postIds: z.array(z.string().min(1)).min(1).max(200),
    mode: z.literal('TIME'),
    time: localTime,
  }),
  z.object({
    postIds: z.array(z.string().min(1)).min(1).max(200),
    mode: z.literal('DATE'),
    date: localDate,
  }),
]);

export const scheduledPostStatusFilterSchema = z.enum(SCHEDULED_POST_STATUSES);

export const listSchedulesQuerySchema = z.object({
  status: scheduledPostStatusFilterSchema.optional(),
  accountId: z.string().min(1).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const postingSettingsSchema = z
  .object({
    enableDailyLimit: z.boolean(),
    dailyPostingLimit: z.number().int().min(1).max(100),
    minimumIntervalMinutes: z.number().int().min(0).max(1440),
    activeHoursStart: localTime,
    activeHoursEnd: localTime,
    activeDays,
    timezone: timeZone,
    limitScope: z.enum(LIMIT_SCOPES),
    defaultSchedulingMode: z.enum(SCHEDULING_MODES).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.activeHoursStart >= value.activeHoursEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['activeHoursEnd'],
        message: 'Active hours end must be after active hours start',
      });
    }
  });

export const accountPostingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    dailyPostingLimit: z.number().int().min(1).max(100),
    minimumIntervalMinutes: z.number().int().min(0).max(1440),
    activeHoursStart: localTime,
    activeHoursEnd: localTime,
    activeDays,
    timezone: timeZone,
  })
  .superRefine((value, ctx) => {
    if (value.activeHoursStart >= value.activeHoursEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['activeHoursEnd'],
        message: 'Active hours end must be after active hours start',
      });
    }
  });

export const generalSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  timezone: timeZone.optional(),
  defaultAccountId: z.string().min(1).nullable().optional(),
  telegramEnabled: z.boolean().optional(),
  telegramChatId: z.string().trim().max(64).nullable().optional(),
});

/** Prompt used when the user has not written their own. Stored empty in the DB means "use this". */
export const DEFAULT_AI_CAPTION_PROMPT =
  'Generate Caption berdasarkan thumbnail video, dengan hashtag yang berpotensi ramai sesuai dengan konteks';

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value), 'Expected an http(s) URL');

export const aiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: httpUrl.optional(),
  model: z.string().trim().max(120).optional(),
  apiKey: z.string().trim().max(400).nullable().optional(),
  prompt: z.string().trim().max(2000).nullable().optional(),
});

export const generateCaptionSchema = z.object({
  prompt: z.string().trim().max(2000).optional(),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type GenerateCaptionInput = z.infer<typeof generateCaptionSchema>;

export const tiktokConnectQuerySchema = z.object({
  redirectTo: z.string().max(200).optional(),
});

export const queueActionSchema = z.object({
  action: z.enum(['pause', 'resume']),
});

export const notificationQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const timelineQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
  timezone: timeZone.optional(),
});

export const tiktokAccountStatusSchema = z.enum(CONNECTION_STATUSES);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
export type PostingSettingsInput = z.infer<typeof postingSettingsSchema>;
export type AccountPostingSettingsInput = z.infer<typeof accountPostingSettingsSchema>;
export type CaptionTemplateInput = z.infer<typeof captionTemplateSchema>;
export type ReschedulePostInput = z.infer<typeof reschedulePostSchema>;
export type MassRescheduleInput = z.infer<typeof massRescheduleSchema>;
export type BulkCaptionInput = z.infer<typeof bulkCaptionSchema>;
export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;

