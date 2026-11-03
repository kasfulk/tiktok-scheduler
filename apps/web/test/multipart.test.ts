import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MultipartError, parseMultipart } from '../lib/multipart';

const BOUNDARY = '----test-boundary';

function build(parts: Array<{ name: string; filename?: string; value: string }>): string {
  return parts
    .map((part) => {
      const disposition = part.filename
        ? `form-data; name="${part.name}"; filename="${part.filename}"`
        : `form-data; name="${part.name}"`;
      return `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n\r\n${part.value}\r\n`;
    })
    .join('') + `--${BOUNDARY}--\r\n`;
}

function request(body: string, declaredLength?: number): Request {
  return new Request('http://localhost/api/videos/upload', {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      ...(declaredLength === undefined ? {} : { 'content-length': String(declaredLength) }),
    },
    body,
  });
}

describe('parseMultipart', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'multipart-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('streams the file part to disk and keeps the text fields', async () => {
    const body = build([
      { name: 'file', filename: 'clip.mp4', value: 'VIDEO-BYTES' },
      { name: 'title', value: 'clip' },
    ]);

    const result = await parseMultipart(request(body), { maxFileBytes: 1024, tempDir });

    expect(result.fields.title).toBe('clip');
    expect(result.file?.filename).toBe('clip.mp4');
    expect(result.file?.size).toBe('VIDEO-BYTES'.length);
    expect(await readFile(result.file!.tempPath, 'utf8')).toBe('VIDEO-BYTES');
  });

  it('reports an empty file part as EMPTY_FILE', async () => {
    const body = build([{ name: 'file', filename: 'clip.mp4', value: '' }]);
    await expect(parseMultipart(request(body), { maxFileBytes: 1024, tempDir })).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    });
  });

  it('names the byte counts when the body is cut short', async () => {
    const body = build([{ name: 'file', filename: 'clip.mp4', value: 'VIDEO-BYTES' }]);
    const truncated = body.slice(0, body.length - 30);

    const error: MultipartError = await parseMultipart(request(truncated, body.length), {
      maxFileBytes: 1024,
      tempDir,
    }).then(
      () => {
        throw new Error('expected parseMultipart to reject');
      },
      (err: MultipartError) => err,
    );

    expect(error).toBeInstanceOf(MultipartError);
    expect(error.message).toContain('Truncated file part');
    expect(error.message).toContain(`received ${truncated.length} of ${body.length} bytes`);
  });

  it('rejects a file that exceeds the configured limit', async () => {
    const body = build([{ name: 'file', filename: 'big.mp4', value: 'x'.repeat(64) }]);
    await expect(parseMultipart(request(body), { maxFileBytes: 8, tempDir })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });
});
