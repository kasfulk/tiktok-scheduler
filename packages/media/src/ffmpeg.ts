import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 120_000;

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string | null;
  bitrate: number | null;
}

export class MediaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
  }
}

function binary(name: 'ffprobe' | 'ffmpeg'): string {
  return process.env[`${name.toUpperCase()}_PATH`] ?? name;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  bit_rate?: string;
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string; bit_rate?: string };
}

/** Read duration/resolution with ffprobe. Throws MediaError('CORRUPT_VIDEO') on unparseable input. */
export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  let stdout: string;
  try {
    const result = await run(
      binary('ffprobe'),
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (error) {
    throw new MediaError('CORRUPT_VIDEO', `ffprobe failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: ProbeOutput;
  try {
    parsed = JSON.parse(stdout) as ProbeOutput;
  } catch {
    throw new MediaError('CORRUPT_VIDEO', 'ffprobe returned unparseable JSON');
  }

  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const duration = Number(parsed.format?.duration ?? video?.duration ?? 0);
  if (!video || !Number.isFinite(duration) || duration <= 0) {
    throw new MediaError('CORRUPT_VIDEO', 'No usable video stream found');
  }

  return {
    duration,
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    codec: video.codec_name ?? null,
    bitrate: Number(parsed.format?.bit_rate ?? 0) || null,
  };
}

/** Extract a single JPEG frame at `atSecond`, scaled to 640px wide. */
export async function generateThumbnail(inputPath: string, outputPath: string, atSecond = 1): Promise<void> {
  try {
    await run(
      binary('ffmpeg'),
      ['-y', '-ss', String(atSecond), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', outputPath],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (error) {
    throw new MediaError('THUMBNAIL_FAILED', `ffmpeg failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(binary('ffprobe'), ['-version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}