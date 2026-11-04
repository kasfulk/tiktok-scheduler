/**
 * Dry-run of the browser publish flow against the Chrome the user is logged into:
 * uploads the file, fills caption + visibility, then discards instead of posting.
 *
 *   BROWSER_CDP=http://127.0.0.1:9333 \
 *     ./node_modules/.bin/tsx scripts/browser-dry-run.ts <video-path> ["caption"]
 */
import { resolve } from 'node:path';
import { publishViaStudio } from '@tiktok-scheduler/browser';

async function main(): Promise<void> {
  const [videoArg, captionArg] = process.argv.slice(2);
  if (!videoArg) {
    console.error('usage: tsx scripts/browser-dry-run.ts <video-path> ["caption"]');
    process.exit(2);
  }

  const result = await publishViaStudio({
    videoPath: resolve(videoArg),
    caption: captionArg ?? 'browser-mode dry run',
    privacyLevel: 'SELF_ONLY',
    dryRun: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
