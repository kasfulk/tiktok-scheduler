import { prisma } from '@tiktok-scheduler/db';
import { ok, route } from '@/lib/api';
import { accountToDto } from '@/lib/dto';
import { tiktokMode } from '@/lib/tiktok';

export const GET = route(async ({ user }) => {
  const accounts = await prisma.tikTokAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return ok({ items: accounts.map(accountToDto), mode: tiktokMode() });
});