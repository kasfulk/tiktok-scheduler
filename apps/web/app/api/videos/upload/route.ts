import { open, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@tiktok-scheduler/db';
import { enqueueProcessVideo } from '@tiktok-scheduler/queue';
import {
  ALLOWED_VIDEO_TYPES,
  absolutePathFor,
  ensureStorageDirs,
  extensionForMime,
  maxUploadBytes,
  newVideoStorageKey,
  sniffVideoMime,
  storageRoot,

} from '@tiktok-scheduler/media';
import { ApiError, ok, route } from '@/lib/api';
import { MultipartError, parseMultipart } from '@/lib/multipart';
import { videoToDto } from '@/lib/dto';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Read the first bytes of the temp file to verify the real container signature. */
async function readHeader(filePath: string, bytes = 16): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export const POST = route(
  async ({ request, user }) => {
    await ensureStorageDirs();

    let parsed;
    try {
      parsed = await parseMultipart(request, { maxFileBytes: maxUploadBytes(), tempDir: path.join(storageRoot(), 'tmp') });
    } catch (error) {
      if (error instanceof MultipartError) throw new ApiError(400, error.code, error.message);
      throw error;
    }

    if (!parsed.file) throw new ApiError(400, 'NO_FILE', 'Attach a video file in the `file` field');

    const { tempPath, filename } = parsed.file;
    const header = await readHeader(tempPath);
    const mimeType = sniffVideoMime(header);
    if (!mimeType) {
      await unlink(tempPath).catch(() => undefined);
      throw new ApiError(415, 'UNSUPPORTED_VIDEO', 'Only MP4, MOV and WebM files are supported');
    }
    const extension = extensionForMime(mimeType) ?? 'mp4';
    if (!Object.values(ALLOWED_VIDEO_TYPES).includes(mimeType)) {
      await unlink(tempPath).catch(() => undefined);
      throw new ApiError(415, 'UNSUPPORTED_VIDEO', 'Only MP4, MOV and WebM files are supported');
    }

    const storageKey = newVideoStorageKey(extension);
    const destination = absolutePathFor(storageKey);
    await rename(tempPath, destination);
    const size = (await stat(destination)).size;

    const title = (parsed.fields.title ?? path.parse(filename).name).slice(0, 300).trim() || 'Untitled video';

    // The row starts as PROCESSING: ffprobe/ffmpeg run in the worker, never inside this request.
    const video = await prisma.video.create({
      data: {
        userId: user.id,
        title,
        filename,
        storageKey,
        mimeType,
        fileSize: size,
        duration: 0,
        width: 0,
        height: 0,
        status: 'PROCESSING',
      },
    });

    try {
      await enqueueProcessVideo(video.id);
    } catch (error) {
      await prisma.video.update({
        where: { id: video.id },
        data: {
          status: 'FAILED',
          processingError: `Queue unavailable: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    }

    return ok(videoToDto(video), { status: 202 });
  },
  { rateLimit: 60 },
);