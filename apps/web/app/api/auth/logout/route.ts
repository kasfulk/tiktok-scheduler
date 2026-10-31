import { ok, route } from '@/lib/api';
import { endSession } from '@/lib/auth-server';

export const POST = route(async () => {
  await endSession();
  return ok({ ok: true });
});