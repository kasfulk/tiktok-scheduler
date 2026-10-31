import { prisma } from '@tiktok-scheduler/db';
import { z } from 'zod';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { accountToDto } from '@/lib/dto';

const patchSchema = z.object({ isDefault: z.literal(true) });

export const PATCH = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const input = await parseBody(request, patchSchema);
  const account = await prisma.tikTokAccount.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'TikTok account not found');

  await prisma.$transaction([
    prisma.tikTokAccount.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    prisma.tikTokAccount.update({ where: { id }, data: { isDefault: input.isDefault } }),
    prisma.user.update({ where: { id: user.id }, data: { defaultAccountId: id } }),
  ]);

  const updated = await prisma.tikTokAccount.findUniqueOrThrow({ where: { id } });
  return ok(accountToDto(updated));
});

export const DELETE = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const account = await prisma.tikTokAccount.findFirst({
    where: { id, userId: user.id },
    select: { id: true, isDefault: true },
  });
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'TikTok account not found');

  // Tokens are deleted with the row; scheduled posts cascade so no orphan job can publish.
  await prisma.tikTokAccount.delete({ where: { id } });

  if (account.isDefault) {
    const next = await prisma.tikTokAccount.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    await prisma.user.update({ where: { id: user.id }, data: { defaultAccountId: next?.id ?? null } });
    if (next) await prisma.tikTokAccount.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return ok({ deleted: true });
});