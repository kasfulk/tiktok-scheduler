import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveFromRepository } from '@tiktok-scheduler/shared/paths';

/** Extensions the upload endpoint accepts, mapped to their canonical MIME type. */
export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export function maxUploadBytes(): number {
  const mb = Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '287', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 287) * 1024 * 1024;
}

export function storageRoot(): string {
  return resolveFromRepository(process.env.STORAGE_ROOT ?? './storage');
}

export function absolutePathFor(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to resolve a path outside the storage root: ${storageKey}`);
  }
  return resolved;
}

export async function ensureStorageDirs(): Promise<void> {
  await Promise.all(
    ['videos', 'thumbnails', 'tmp'].map((dir) => mkdir(path.join(storageRoot(), dir), { recursive: true })),
  );
}

export function newVideoStorageKey(extension: string): string {
  const safe = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
  return path.posix.join('videos', `${randomUUID()}.${safe}`);
}

export function thumbnailKeyFor(videoId: string): string {
  return path.posix.join('thumbnails', `${videoId}.jpg`);
}

export function tempUploadPath(extension: string): string {
  const safe = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
  return path.join(storageRoot(), 'tmp', `${randomUUID()}.${safe}`);
}

export async function removeStoredFile(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  await unlink(absolutePathFor(storageKey)).catch(() => undefined);
}

export async function storedFileSize(storageKey: string): Promise<number> {
  const info = await stat(absolutePathFor(storageKey));
  return info.size;
}

/**
 * Sniff the real container from magic bytes; a client-declared MIME type is never trusted.
 * Returns the canonical MIME type, or null when the bytes are not a supported video container.
 */
export function sniffVideoMime(header: Buffer): string | null {
  if (header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = header.subarray(8, 12).toString('ascii');
    if (brand.startsWith('qt')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (header.length >= 4 && header.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  return null;
}

export function extensionForMime(mime: string): string | null {
  return Object.entries(ALLOWED_VIDEO_TYPES).find(([, value]) => value === mime)?.[0] ?? null;
}