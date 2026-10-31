import { ok, route } from '@/lib/api';
import type { SessionUserDto } from '@/lib/types';

export const GET = route(async ({ user }) => {
  const body: { user: SessionUserDto } = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      defaultAccountId: user.defaultAccountId,
    },
  };
  return ok(body);
});