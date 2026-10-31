import { open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@tiktok-scheduler/db';
import { enqueueProcessVideo } from '@tiktok-scheduler/queue';
import {
  absolutePathFor,
  ensureStorageDirs,
  extensionForMime,
  maxUploadBytes,
  newVideoStorageKey,
  removeStoredFile,
  sniffVideoMime,
  storageRoot,
} from '@tiktok-scheduler/media';
import { ApiError, ok, requireParam, route } from '@/lib/api';
import { MultipartError, parseMultipart } from '@/lib/multipart';
import { videoToDto } from '@/lib/dto';


export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = route(async ({ request, user, params }) => {
  const id = requireParam(params, 'id');
  const existing = await prisma.video.findFirst({
    where: { id, userId: user.id },
    select: { id: true, storageKey: true, thumbnailKey: true },
  });
  if (!existing) throw new ApiError(404, 'VIDEO_NOT_FOUND', 'Video not found');

  await ensureStorageDirs();
  let parsed;
  try {
    parsed = await parseMultipart(request, { maxFileBytes: maxUploadBytes(), tempDir: path.join(storageRoot(), 'tmp') });
  } catch (error) {
    if (error instanceof MultipartError) throw new ApiError(400, error.code, error.message);
    throw error;
  }
  if (!parsed.file) throw new ApiError(400, 'NO_FILE', 'Attach a replacement video file');

  const handle = await open(parsed.file.tempPath, 'r');
  const header = Buffer.alloc(16);
  const { bytesRead } = await handle.read(header, 0, 16, 0);
  await handle.close();

  const mimeType = sniffVideoMime(header.subarray(0, bytesRead));
  if (!mimeType) {
    await unlink(parsed.file.tempPath).catch(() => undefined);
    throw new ApiError(415, 'UNSUPPORTED_VIDEO', 'Only MP4, MOV and WebM files are supported');
  }

  const storageKey = newVideoStorageKey(extensionForMime(mimeType) ?? 'mp4');
  await rename(parsed.file.tempPath, absolutePathFor(storageKey));

  const video = await prisma.video.update({
    where: { id },
    data: {
      storageKey,
      mimeType,
      fileSize: parsed.file.size,
      status: 'PROCESSING',
      processingError: null,
      duration: 0,
      width: 0,
      height: 0,
    },
  });

  await removeStoredFile(existing.storageKey);
  await removeStoredFile(existing.thumbnailKey);
  await enqueueProcessVideo(video.id);

  return ok(videoToDto(video));
});