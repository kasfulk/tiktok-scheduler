import { markNotificationsRead } from '@tiktok-scheduler/db';
import { z } from 'zod';
import { ok, route } from '@/lib/api';

const bodySchema = z.object({ ids: z.array(z.string().min(1)).max(200).optional() });

export const POST = route(async ({ request, user }) => {
  const raw = await request.text();
  const parsed = bodySchema.safeParse(raw ? JSON.parse(raw) : {});
  const ids = parsed.success ? parsed.data.ids : undefined;
  const updated = await markNotificationsRead(user.id, ids);
  return ok({ updated });
});