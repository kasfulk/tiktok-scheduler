import { prisma } from '@tiktok-scheduler/db';
import { bulkCaptionSchema, TIKTOK_CAPTION_MAX_LENGTH } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';

/** Fill `{title}` / `{description}` / `{hashtags}` placeholders for one video. */
function renderTemplate(template: string, context: { title: string; description: string; hashtags: string }): string {
  return template
    .replaceAll('{title}', context.title)
    .replaceAll('{description}', context.description)
    .replaceAll('{hashtags}', context.hashtags)
    .trim();
}

export const POST = route(async ({ request, user }) => {
  const input = await parseBody(request, bulkCaptionSchema);

  const videos = await prisma.video.findMany({
    where: { userId: user.id, id: { in: input.videoIds } },
    select: { id: true, title: true, caption: true, hashtags: true },
  });
  if (videos.length === 0) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'None of those videos exist');

  const template = input.captionTemplateId
    ? await prisma.captionTemplate.findFirst({
        where: { id: input.captionTemplateId, userId: user.id },
        select: { content: true },
      })
    : null;
  if (input.captionTemplateId && !template) {
    throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Caption template not found');
  }

  const updates = videos.map((video) => {
    const baseCaption = input.caption ?? video.caption ?? '';
    const rendered = template
      ? renderTemplate(template.content, {
          title: video.title,
          description: baseCaption,
          hashtags: input.hashtags ?? video.hashtags ?? '',
        })
      : input.caption ?? video.caption ?? null;

    if (rendered && rendered.length > TIKTOK_CAPTION_MAX_LENGTH) {
      throw new ApiError(
        422,
        'CAPTION_TOO_LONG',
        `Caption for "${video.title}" is ${rendered.length} characters; TikTok allows ${TIKTOK_CAPTION_MAX_LENGTH}`,
      );
    }

    const combined =
      input.append && rendered && video.caption && !template
        ? `${video.caption} ${rendered}`.trim()
        : rendered;

    return prisma.video.update({
      where: { id: video.id },
      data: {
        caption: combined,
        ...(input.hashtags !== undefined && !template ? { hashtags: input.hashtags } : {}),
      },
    });
  });

  await prisma.$transaction(updates);
  return ok({ updated: updates.length });
});