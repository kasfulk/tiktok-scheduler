import { createReadStream, statSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { absolutePathFor } from '@tiktok-scheduler/media';

/** Serve a stored file with Range support, authenticated by the caller. */
export function streamStoredFile(
  storageKey: string,
  request: Request,
  contentType: string,
): Response {
  const filePath = absolutePathFor(storageKey);
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return NextResponse.json(
      { error: { code: 'FILE_NOT_FOUND', message: 'The stored file is missing' } },
      { status: 404 },
    );
  }

  const range = request.headers.get('range');
  if (!range) {
    return new NextResponse(readableStreamOf(filePath, 0, size - 1), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (Number.isNaN(start) || start > end || start >= size) {
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  return new NextResponse(readableStreamOf(filePath, start, end), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

function readableStreamOf(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}