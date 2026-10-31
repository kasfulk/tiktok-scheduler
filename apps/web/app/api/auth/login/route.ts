import { prisma } from '@tiktok-scheduler/db';
import { verifyPassword } from '@tiktok-scheduler/db';
import { loginSchema } from '@tiktok-scheduler/shared';
import { ApiError, clientIp, ok, parseBody, route } from '@/lib/api';
import { startSession } from '@/lib/auth-server';

export const POST = route(
  async ({ request }) => {
    const input = await parseBody(request, loginSchema);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, timezone: true, password: true, defaultAccountId: true },
    });

    // Same error for unknown email and wrong password: do not leak account existence.
    const valid = user ? await verifyPassword(input.password, user.password) : false;
    if (!user || !valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    await startSession(user.id, { userAgent: request.headers.get('user-agent'), ip: clientIp(request) });
    const { password: _password, ...safe } = user;
    return ok({ user: safe });
  },
  { public: true, rateLimit: 10 },
);