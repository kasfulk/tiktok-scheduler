import { prisma } from '@tiktok-scheduler/db';
import { captionTemplateSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';

export const GET = route(async ({ user }) => {
  const items = await prisma.captionTemplate.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return ok({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      content: item.content,
      isDefault: item.isDefault,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
});

export const POST = route(async ({ request, user }) => {
  const input = await parseBody(request, captionTemplateSchema);
  const duplicate = await prisma.captionTemplate.findFirst({
    where: { userId: user.id, name: input.name },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, 'TEMPLATE_EXISTS', 'A template with that name already exists');

  const template = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.captionTemplate.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    }
    return tx.captionTemplate.create({
      data: { userId: user.id, name: input.name, content: input.content, isDefault: input.isDefault ?? false },
    });
  });

  return ok(
    {
      id: template.id,
      name: template.name,
      content: template.content,
      isDefault: template.isDefault,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    },
    { status: 201 },
  );
});