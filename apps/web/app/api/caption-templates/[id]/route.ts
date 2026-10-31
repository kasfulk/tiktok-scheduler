import { prisma } from '@tiktok-scheduler/db';
import { updateCaptionTemplateSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';

export const PATCH = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const input = await parseBody(request, updateCaptionTemplateSchema);
  const existing = await prisma.captionTemplate.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Caption template not found');

  const template = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.captionTemplate.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    }
    return tx.captionTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
  });

  return ok({
    id: template.id,
    name: template.name,
    content: template.content,
    isDefault: template.isDefault,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  });
});

export const DELETE = route(async ({ user, params }) => {
  const id = requireParam(params, 'id');
  const existing = await prisma.captionTemplate.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Caption template not found');
  await prisma.captionTemplate.delete({ where: { id } });
  return ok({ deleted: true });
});