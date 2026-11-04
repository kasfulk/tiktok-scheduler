import { prisma, encryptSecret } from '@tiktok-scheduler/db';
import { aiSettingsSchema } from '@tiktok-scheduler/shared';
import { ApiError, ok, parseBody, route } from '@/lib/api';
import { aiSettingsToDto } from '@/lib/ai';
import type { AiSettingsDto } from '@/lib/types';

const select = {
  aiCaptionEnabled: true,
  aiBaseUrl: true,
  aiModel: true,
  aiApiKey: true,
  aiPrompt: true,
};

export const GET = route(async ({ user }) => {
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select,
  });
  if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
  const body: AiSettingsDto = aiSettingsToDto(row);
  return ok(body);
});

export const PATCH = route(async ({ request, user }) => {
  const input = await parseBody(request, aiSettingsSchema);
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select,
  });
  if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');

  const enabled = input.enabled ?? row.aiCaptionEnabled;
  const model = input.model ?? row.aiModel;
  if (enabled && model.trim() === '') {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Provide a model name before enabling AI caption generation', [
      { path: 'model', message: 'Model is required when AI caption generation is enabled' },
    ]);
  }

  const apiKeyData =
    input.apiKey === undefined ? {} : input.apiKey === null || input.apiKey === '' ? { aiApiKey: null } : { aiApiKey: encryptSecret(input.apiKey) };
  const promptData =
    input.prompt === undefined ? {} : { aiPrompt: input.prompt === null || input.prompt === '' ? '' : input.prompt };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.enabled !== undefined ? { aiCaptionEnabled: input.enabled } : {}),
      ...(input.baseUrl !== undefined ? { aiBaseUrl: input.baseUrl } : {}),
      ...(input.model !== undefined ? { aiModel: input.model } : {}),
      ...promptData,
      ...apiKeyData,
    },
    select,
  });

  const body: AiSettingsDto = aiSettingsToDto(updated);
  return ok(body);
});
