import { readFile } from 'node:fs/promises';
import { prisma } from '@tiktok-scheduler/db';
import { generateCaptionSchema } from '@tiktok-scheduler/shared';
import { absolutePathFor } from '@tiktok-scheduler/media';
import { ApiError, ok, parseBody, requireParam, route } from '@/lib/api';
import { generateCaption, loadAiCaptionConfig } from '@/lib/ai';
import type { GenerateCaptionResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const input = await parseBody(request, generateCaptionSchema);

  const config = await loadAiCaptionConfig(user.id);
  if (!config) {
    throw new ApiError(409, 'AI_NOT_CONFIGURED', 'AI caption generation is not configured. Enable it in Settings → AI.');
  }

  const video = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { title: true, caption: true, thumbnailKey: true },
  });
  if (!video) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
  if (!video.thumbnailKey) {
    throw new ApiError(422, 'THUMBNAIL_REQUIRED', 'This video has no thumbnail yet, so the vision model has nothing to look at.');
  }

  let imageBase64: string;
  try {
    imageBase64 = (await readFile(absolutePathFor(video.thumbnailKey))).toString('base64');
  } catch {
    throw new ApiError(422, 'THUMBNAIL_REQUIRED', 'The thumbnail file is missing; reprocess the video first.');
  }

  let result: { caption: string; hashtags: string };
  try {
    result = await generateCaption({
      config,
      prompt: input.prompt?.trim() || config.prompt,
      existingCaption: video.caption,
      title: video.title,
      imageBase64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError(502, 'AI_REQUEST_FAILED', `The AI model could not produce a caption: ${message}`);
  }

  return ok({ caption: result.caption, hashtags: result.hashtags, model: config.model } satisfies GenerateCaptionResult);
});
