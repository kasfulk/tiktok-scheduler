import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export class MultipartError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MultipartError';
    this.code = code;
  }
}

export interface ParsedFilePart {
  fieldName: string;
  filename: string;
  contentType: string | null;
  tempPath: string;
  size: number;
}

export interface MultipartResult {
  fields: Record<string, string>;
  file: ParsedFilePart | null;
}

const MAX_FIELD_BYTES = 64 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;

/**
 * Streaming multipart/form-data parser. Bytes go straight to a temp file, so a 287 MB upload never
 * occupies 287 MB of heap (which `request.formData()` would). Only the first file part is kept.
 */
export async function parseMultipart(
  request: Request,
  options: { maxFileBytes: number; tempDir: string },
): Promise<MultipartResult> {
  const contentType = request.headers.get('content-type') ?? '';
  const boundary = extractBoundary(contentType);
  if (!request.body) throw new MultipartError('EMPTY_BODY', 'Request has no body');

  // Tracked only to explain a truncated body: `received X of Y` points straight at a Content-Length
  // mismatch (binary pasted into a shell string, aborted connection) instead of a vague parser error.
  const declaredBytes = Number(request.headers.get('content-length') ?? '');
  let receivedBytes = 0;
  const truncationDetail = () =>
    Number.isFinite(declaredBytes) && declaredBytes > 0
      ? ` (received ${receivedBytes} of ${declaredBytes} bytes)`
      : ` (received ${receivedBytes} bytes)`;

  const boundaryBytes = Buffer.from(`--${boundary}`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const reader = request.body.getReader();
  let buffer = Buffer.alloc(0);
  let streamDone = false;

  const pull = async (): Promise<boolean> => {
    const next = await reader.read();
    if (next.done) {
      streamDone = true;
      return false;
    }
    buffer = Buffer.concat([buffer, Buffer.from(next.value)]);
    receivedBytes += next.value.byteLength;
    return true;
  };

  const fill = async (minBytes: number): Promise<void> => {
    while (buffer.length < minBytes && !streamDone) await pull();
  };

  const fields: Record<string, string> = {};
  let file: ParsedFilePart | null = null;

  // Preamble: skip anything before the first boundary.
  await fill(boundaryBytes.length);
  const preambleAt = buffer.indexOf(boundaryBytes);
  if (preambleAt < 0) throw new MultipartError('INVALID_MULTIPART', 'Boundary not found in request body');
  buffer = buffer.subarray(preambleAt + boundaryBytes.length);

  for (;;) {
    await fill(4);
    if (buffer.subarray(0, 2).toString() === '--') break; // closing boundary
    if (buffer.subarray(0, 2).toString() === '\r\n') buffer = buffer.subarray(2);

    const headers = await readHeaders();
    const disposition = headers['content-disposition'] ?? '';
    const name = /name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    if (!name) throw new MultipartError('INVALID_MULTIPART', 'Part is missing a field name');

    if (filename !== undefined) {
      const part = await readFilePart(name, filename, headers['content-type'] ?? null);
      file ??= part;
      if (file !== part) await unlink(part.tempPath).catch(() => undefined);
    } else {
      const value = await readFieldValue();
      fields[name] = value;
    }

    await fill(delimiter.length);
    if (!buffer.subarray(0, delimiter.length).equals(delimiter)) {
      throw new MultipartError('INVALID_MULTIPART', 'Missing part delimiter');
    }
    buffer = buffer.subarray(delimiter.length);
  }

  try {
    await reader.cancel();
  } catch {
    /* stream already closed */
  }

  return { fields, file };

  async function readHeaders(): Promise<Record<string, string>> {
    const terminator = Buffer.from('\r\n\r\n');
    let scanned = 0;
    for (;;) {
      const index = buffer.indexOf(terminator);
      if (index >= 0) {
        const raw = buffer.subarray(0, index).toString('utf8');
        buffer = buffer.subarray(index + terminator.length);
        return parseHeaderBlock(raw);
      }
      scanned = buffer.length;
      if (scanned > MAX_HEADER_BYTES) throw new MultipartError('INVALID_MULTIPART', 'Part headers are too large');
      if (!(await pull())) throw new MultipartError('INVALID_MULTIPART', `Truncated part headers${truncationDetail()}`);
    }
  }

  async function readFieldValue(): Promise<string> {
    const terminator = Buffer.from('\r\n--');
    let searchFrom = 0;
    for (;;) {
      // Look for the RFC delimiter prefix; the full boundary is verified by the caller.
      const index = buffer.indexOf(terminator, searchFrom);
      if (index >= 0) {
        const value = buffer.subarray(0, index).toString('utf8');
        buffer = buffer.subarray(index); // keep `\r\n--boundary` for the part loop
        return value;
      }
      searchFrom = Math.max(0, buffer.length - terminator.length + 1);
      if (buffer.length > MAX_FIELD_BYTES) throw new MultipartError('FIELD_TOO_LARGE', 'Form field is too large');
      if (!(await pull())) throw new MultipartError('INVALID_MULTIPART', `Truncated form field${truncationDetail()}`);
    }
  }

  async function readFilePart(
    fieldName: string,
    filename: string,
    partContentType: string | null,
  ): Promise<ParsedFilePart> {
    const safeName = path.basename(filename).slice(0, 255) || 'upload.bin';
    const tempPath = path.join(options.tempDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const sink = createWriteStream(tempPath);
    const sinkClosed = new Promise<void>((resolve, reject) => {
      sink.on('finish', resolve);
      sink.on('error', reject);
    });

    let written = 0;
    let overflow = false;

    try {
      for (;;) {
        const index = buffer.indexOf(delimiter);
        if (index >= 0) {
          if (index > 0) {
            sink.write(buffer.subarray(0, index));
            written += index;
          }
          buffer = buffer.subarray(index);
          break;
        }
        // Keep only as many bytes as a delimiter could straddle, flush the rest to disk.
        const keep = delimiter.length - 1;
        const flushLength = buffer.length - keep;
        if (flushLength > 0) {
          const slice = buffer.subarray(0, flushLength);
          written += slice.length;
          if (written > options.maxFileBytes) overflow = true;
          if (!overflow) sink.write(slice);
          buffer = buffer.subarray(flushLength);
        }
        if (!(await pull())) {
          throw new MultipartError(
            'INVALID_MULTIPART',
            `Truncated file part${truncationDetail()}: the body ended before the closing boundary`,
          );
        }
      }
    } catch (error) {
      sink.destroy();
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }

    await new Promise<void>((resolve, reject) => {
      sink.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
    await sinkClosed;

    if (overflow || written > options.maxFileBytes) {
      await unlink(tempPath).catch(() => undefined);
      throw new MultipartError('FILE_TOO_LARGE', 'File exceeds the configured upload limit');
    }
    if (written === 0) {
      await unlink(tempPath).catch(() => undefined);
      throw new MultipartError('EMPTY_FILE', 'Uploaded file is empty');
    }

    return { fieldName, filename: safeName, contentType: partContentType, tempPath, size: written };
  }
}

function extractBoundary(contentType: string): string {
  if (!/multipart\/form-data/i.test(contentType)) {
    throw new MultipartError('UNSUPPORTED_CONTENT_TYPE', 'Expected a multipart/form-data request');
  }
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  if (!boundary) throw new MultipartError('INVALID_MULTIPART', 'Multipart boundary is missing');
  return boundary;
}

function parseHeaderBlock(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split('\r\n')) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}