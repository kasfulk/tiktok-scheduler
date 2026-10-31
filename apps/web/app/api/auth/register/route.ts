import { hashPassword, prisma } from '@tiktok-scheduler/db';
import { registerSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route, clientIp } from '@/lib/api';
import { startSession } from '@/lib/auth-server';

export const POST = route(
  async ({ request }) => {
    const input = await parseBody(request, registerSchema);

    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: await hashPassword(input.password),
        timezone: input.timezone ?? 'UTC',
      },
      select: { id: true, name: true, email: true, timezone: true, defaultAccountId: true },
    });

    await prisma.postingSettings.create({
      data: { userId: user.id, timezone: user.timezone },
    });

    await startSession(user.id, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });

    return ok({ user }, { status: 201 });
  },
  { public: true, rateLimit: 10 },
);