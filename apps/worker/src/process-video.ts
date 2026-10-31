import { prisma } from '@tiktok-scheduler/db';
import { absolutePathFor, generateThumbnail, probeVideo, thumbnailKeyFor, MediaError } from '@tiktok-scheduler/media';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { log } from '@tiktok-scheduler/shared';
import { storageRoot } from '@tiktok-scheduler/media';

/**
 * Metadata + thumbnail job. Runs outside the HTTP request so a 287 MB upload never blocks a route,
 * and so FFmpeg failures surface as a per-video error instead of a 500 on the upload.
 */
export async function processVideo(videoId: string): Promise<'READY' | 'FAILED' | 'SKIPPED'> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, storageKey: true, status: true },
  });
  if (!video) return 'SKIPPED';

  const inputPath = absolutePathFor(video.storageKey);
  await mkdir(path.join(storageRoot(), 'thumbnails'), { recursive: true });

  try {
    const metadata = await probeVideo(inputPath);
    if (metadata.duration < 1) throw new MediaError('CORRUPT_VIDEO', 'Video is shorter than one second');

    const thumbnailKey = thumbnailKeyFor(video.id);
    const thumbnailPath = absolutePathFor(thumbnailKey);
    const atSecond = metadata.duration > 3 ? 1 : Math.max(0.1, metadata.duration / 2);
    await generateThumbnail(inputPath, thumbnailPath, atSecond);

    await prisma.video.update({
      where: { id: video.id },
      data: {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        thumbnailKey,
        processingError: null,
        status: 'READY',
      },
    });
    log('info', 'video_processed', {
      videoId,
      duration: Math.round(metadata.duration),
      width: metadata.width,
      height: metadata.height,
    });
    return 'READY';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'FAILED', processingError: message },
    });
    log('error', 'video_processing_failed', { videoId, error: message });
    return 'FAILED';
  }
}

/** Kept for the health check: proves the worker can write to the storage volume. */
export async function storageWritable(): Promise<boolean> {
  try {
    await mkdir(path.join(storageRoot(), 'tmp'), { recursive: true });
    const probe = createWriteStream(path.join(storageRoot(), 'tmp', '.health'), { flags: 'w' });
    await new Promise<void>((resolve, reject) => {
      probe.end('ok', (error?: Error | null) => (error ? reject(error) : resolve()));
    });
    return true;
  } catch {
    return false;
  }
}