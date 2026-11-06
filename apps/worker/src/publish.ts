import { stat } from 'node:fs/promises';
import {
  armPublishJob,
  countDayCapacity,

  getEffectivePolicy,
  prisma,
  SchedulingError,
} from '@tiktok-scheduler/db';
import { absolutePathFor } from '@tiktok-scheduler/media';
import { BrowserError, publishViaStudio } from '@tiktok-scheduler/browser';
import { acquireLock, enqueueDeadLetter } from '@tiktok-scheduler/queue';
import { TIKTOK_CAPTION_MAX_LENGTH, formatLocalDate, log, type NotificationType } from '@tiktok-scheduler/shared';
import { TikTokApiError, type TikTokClient } from '@tiktok-scheduler/tiktok';
import { backoffMs, createClient, demoMode, maxRetries, publishTimeoutMs, tiktokMode } from './config.js';
import { notify } from './notifier.js';
import { importBrowserSessionBeforePublish } from './browser-session.js';
import { ensureAccessToken } from './tokens.js';

export type PublishOutcome = 'PUBLISHED' | 'FAILED' | 'RETRY' | 'MANUAL' | 'SKIPPED';

const POLL_START_MS = 2_000;
const POLL_MAX_MS = 30_000;

export function composeCaption(video: { caption: string | null; hashtags: string | null; title: string }): string {
  const body = [video.caption?.trim(), video.hashtags?.trim()].filter(Boolean).join(' ');
  return (body || video.title).slice(0, TIKTOK_CAPTION_MAX_LENGTH);
}

interface LoadedPost {
  id: string;
  videoId: string;
  accountId: string;
  retryCount: number;
  maxRetries: number;
  scheduledAt: Date;
  privacyLevel: string;
  publishMethod: string;
  externalPublishId: string | null;
  video: {
    id: string;
    title: string;
    caption: string | null;
    hashtags: string | null;
    storageKey: string;
    fileSize: number;
    duration: number;
    status: string;
  };
  account: {
    id: string;
    userId: string;
    username: string;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
    connectionStatus: string;
    authMode: string;
    user: { telegramEnabled: boolean; telegramChatId: string | null };
  };
}

interface PublishContext {
  post: LoadedPost;
  telegram: { enabled: boolean; chatId: string | null };
  /** Demo publish: browser-session account in mock mode, nothing reaches TikTok. */
  demo: boolean;
}

/**
 * Publish one scheduled post.
 *
 * Invariants:
 *  - the row is claimed atomically (QUEUED/PENDING → PUBLISHING), so only one worker runs it;
 *  - once TikTok returned a publish id we never create a second post for it — we only poll;
 *  - an attempt whose outcome is unknown becomes MANUAL_ACTION_REQUIRED, never a blind retry.
 */
export async function publishPost(params: {
  postId: string;
  workerId: string;
  client?: TikTokClient;
}): Promise<PublishOutcome> {
  const { postId, workerId } = params;
  const client = params.client ?? createClient();

  const lease = await acquireLock(`publish:${postId}`, publishTimeoutMs() + 60_000).catch(() => null);
  if (!lease) {
    log('info', 'publish_locked_elsewhere', { postId });
    return 'SKIPPED';
  }

  let claimed = false;
  try {
    const claim = await prisma.scheduledPost.updateMany({
      where: { id: postId, status: { in: ['QUEUED', 'PENDING'] } },
      data: { status: 'PUBLISHING', attemptStartedAt: new Date(), lockedBy: workerId, lockedAt: new Date() },
    });
    if (claim.count === 0) {
      log('info', 'publish_claim_skipped', { postId });
      return 'SKIPPED';
    }
    claimed = true;

    const post = await loadPost(postId);
    if (!post) return 'SKIPPED';
    const ctx: PublishContext = {
      post,
      telegram: { enabled: post.account.user.telegramEnabled, chatId: post.account.user.telegramChatId },
      demo: demoMode() && tiktokMode() === 'mock',
    };

    // One line per attempt so a silent queue is distinguishable from a stuck publish.
    log('info', 'publish_started', {
      postId,
      workerId,
      account: post.account.username,
      authMode: post.account.authMode,
      videoId: post.video.id,
      publishMethod: post.publishMethod,
      privacyLevel: post.privacyLevel,
      videoSizeBytes: post.video.fileSize,
      retryCount: post.retryCount,
      resumePublishId: post.externalPublishId,
      demoMode: ctx.demo,
    });

    if (post.account.connectionStatus === 'DISCONNECTED') {
      return await failOrRetry(ctx, 'ACCOUNT_DISCONNECTED', 'The TikTok account was disconnected', {
        terminal: true,
        notification: { type: 'ACCOUNT_DISCONNECTED', title: 'TikTok account disconnected' },
      });
    }

    const gate = await checkGates(ctx);
    if (gate) return gate;

    try {
      await stat(absolutePathFor(post.video.storageKey));
    } catch {
      return await failOrRetry(ctx, 'FILE_MISSING', 'The video file is missing from storage', { terminal: true });
    }

    // Browser-session accounts carry no API token: the logged-in Chrome is their credential.
    // Demo keeps going through the mock API so the demo instance never touches a real account.
    const browserAccount = post.account.authMode === 'BROWSER';
    if (browserAccount && !ctx.demo) {
      return await publishThroughBrowser(ctx);
    }

    let accessToken: string;
    if (ctx.demo && browserAccount) {
      // No OAuth token exists for a browser-session account; the mock server takes any bearer.
      accessToken = 'mock-browser-session';
    } else {
      try {
        accessToken = await ensureAccessToken(
          {
            id: post.account.id,
            userId: post.account.userId,
            accessToken: post.account.accessToken,
            refreshToken: post.account.refreshToken,
            tokenExpiresAt: post.account.tokenExpiresAt,
          },
          client,
        );
      } catch (error) {
        return await failOrRetry(ctx, 'TOKEN_EXPIRED', describeError(error), {
          terminal: true,
          notification: { type: 'TOKEN_EXPIRED', title: 'TikTok token expired' },
        });
      }
    }

    // Resume path: a publish id already exists — poll it, never initialise another post.
    if (post.externalPublishId) {
      await recordLog(postId, 'PUBLISH_RESUMED', { publishId: post.externalPublishId });
      return await pollUntilResolved(ctx, client, accessToken, post.externalPublishId);
    }

    let creatorInfo;
    try {
      creatorInfo = await client.queryCreatorInfo(accessToken);
    } catch (error) {
      return await failOrRetry(ctx, 'CREATOR_INFO_FAILED', describeError(error), {
        terminal: isTerminalTikTokError(error),
        notification: { type: 'PUBLISH_FAILED', title: 'Creator info request failed' },
      });
    }

    if (!creatorInfo.privacyLevelOptions.includes(post.privacyLevel)) {
      return await failOrRetry(
        ctx,
        'PRIVACY_NOT_ALLOWED',
        `TikTok does not allow "${post.privacyLevel}" for this creator (allowed: ${creatorInfo.privacyLevelOptions.join(', ')}).`,
        { terminal: true },
      );
    }
    if (
      post.video.duration > 0 &&
      creatorInfo.maxVideoPostDurationSec > 0 &&
      post.video.duration > creatorInfo.maxVideoPostDurationSec
    ) {
      return await failOrRetry(
        ctx,
        'VIDEO_TOO_LONG',
        `Video is ${Math.round(post.video.duration)}s; this creator allows ${creatorInfo.maxVideoPostDurationSec}s.`,
        { terminal: true },
      );
    }

    const initInput = {
      title: composeCaption(post.video),
      privacyLevel: post.privacyLevel,
      disableComment: creatorInfo.commentDisabled,
      disableDuet: creatorInfo.duetDisabled,
      disableStitch: creatorInfo.stitchDisabled,
      videoSizeBytes: post.video.fileSize,
      videoDurationSec: post.video.duration,
    };

    let initialized;
    try {
      initialized =
        post.publishMethod === 'UPLOAD_DRAFT'
          ? await client.initInboxUpload(accessToken, initInput)
          : await client.initDirectPost(accessToken, initInput);
    } catch (error) {
      // The request may have created a post server-side; without an id the outcome is unknown.
      if (error instanceof TikTokApiError && error.retryable && error.httpStatus === 429) {
        return await failOrRetry(ctx, 'RATE_LIMITED', describeError(error), { terminal: false });
      }
      return await failOrRetry(ctx, 'INIT_UNKNOWN_OUTCOME', describeError(error), {
        terminal: true,
        notification: { type: 'MANUAL_ACTION_REQUIRED', title: 'Publish attempt needs verification' },
      });
    }

    // Persist the publish id BEFORE uploading: from here on the attempt is recoverable.
    await prisma.scheduledPost.update({
      where: { id: postId },
      data: { externalPublishId: initialized.publishId },
    });
    await recordLog(postId, 'POST_INITIALIZED', {
      publishId: initialized.publishId,
      method: post.publishMethod,
      privacyLevel: post.privacyLevel,
      videoSizeBytes: post.video.fileSize,
    });

    try {
      await client.uploadVideoFile(initialized.uploadUrl, absolutePathFor(post.video.storageKey), post.video.fileSize);
      await recordLog(postId, 'VIDEO_UPLOADED', { publishId: initialized.publishId });
    } catch (error) {
      // The upload URL is not persisted, so a retry would need a new init (a second post). Stop here.
      return await failOrRetry(ctx, 'UPLOAD_INTERRUPTED', describeError(error), {
        terminal: true,
        notification: { type: 'MANUAL_ACTION_REQUIRED', title: 'Upload interrupted — verify in TikTok' },
      });
    }

    return await pollUntilResolved(ctx, client, accessToken, initialized.publishId);
  } catch (error) {
    log('error', 'publish_crashed', { postId, error: error instanceof Error ? error.message : String(error) });
    if (claimed) {
      await prisma.scheduledPost
        .updateMany({
          where: { id: postId, status: 'PUBLISHING' },
          data: { status: 'MANUAL_ACTION_REQUIRED', errorMessage: `Worker crashed mid-publish: ${describeError(error)}` },
        })
        .catch(() => undefined);
    }
    return 'MANUAL';
  } finally {
    await lease();
  }
}

async function loadPost(postId: string): Promise<LoadedPost | null> {
  return prisma.scheduledPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      videoId: true,
      accountId: true,
      retryCount: true,
      maxRetries: true,
      scheduledAt: true,
      privacyLevel: true,
      publishMethod: true,
      externalPublishId: true,
      video: {
        select: {
          id: true,
          title: true,
          caption: true,
          hashtags: true,
          storageKey: true,
          fileSize: true,
          duration: true,
          status: true,
        },
      },
      account: {
        select: {
          id: true,
          userId: true,
          username: true,
          accessToken: true,
          refreshToken: true,
          tokenExpiresAt: true,
          connectionStatus: true,
          authMode: true,
          user: { select: { telegramEnabled: true, telegramChatId: true } },
        },
      },
    },
  });
}

/** Daily-limit + video-readiness checks against live data. */
async function checkGates(ctx: PublishContext): Promise<PublishOutcome | null> {
  const { post } = ctx;
  if (post.video.status !== 'READY' && post.video.status !== 'SCHEDULED') {
    return failOrRetry(ctx, 'VIDEO_NOT_READY', `Video status is ${post.video.status}`, { terminal: false });
  }

  const policy = await getEffectivePolicy(post.account.userId, post.accountId);
  const timezone = policy.timezone;
  const localDate = formatLocalDate(post.scheduledAt, timezone);
  const counts = await countDayCapacity({
    userId: post.account.userId,
    accountId: post.accountId,
    localDate,
    timezone,
  });
  const accountCount = Math.max(0, counts.account - 1);
  const globalCount = Math.max(0, counts.global - 1);

  if (policy.enableDailyLimit && accountCount >= policy.dailyPostingLimit) {
    return failOrRetry(
      ctx,
      'DAILY_LIMIT_REACHED',
      `Account already has ${accountCount} posts on ${localDate} (limit ${policy.dailyPostingLimit})`,
      { terminal: true, notification: { type: 'DAILY_LIMIT_REACHED', title: 'Daily limit reached' } },
    );
  }
  if (policy.globalDailyLimit !== null && globalCount >= policy.globalDailyLimit) {
    return failOrRetry(
      ctx,
      'GLOBAL_LIMIT_REACHED',
      `All accounts already have ${globalCount} posts on ${localDate} (limit ${policy.globalDailyLimit})`,
      { terminal: true, notification: { type: 'DAILY_LIMIT_REACHED', title: 'Global daily limit reached' } },
    );
  }
  return null;
}

async function publishThroughBrowser(ctx: PublishContext): Promise<PublishOutcome> {
  const { post } = ctx;
  const videoPath = absolutePathFor(post.video.storageKey);

  // One Chrome tab, one post at a time: a second flow would fight the first over the same page.
  // The lease must outlive the studio upload timeout (15 min), not just the API poll deadline.
  const lease = await acquireLock('browser-publish', Math.max(publishTimeoutMs(), 20 * 60_000)).catch(() => null);
  if (!lease) {
    return failOrRetry(ctx, 'BROWSER_BUSY', 'Another browser publish is running; this one goes back in the queue', {
      terminal: false,
    });
  }

  try {
    // Re-import the session right before posting: the stored cookie jar is a snapshot taken at
    // setup time, while the browser is the live credential. Same import as the UI button.
    await importBrowserSessionBeforePublish(post.account);
    await recordLog(post.id, 'BROWSER_SESSION_IMPORTED', { browserAccount: post.account.username });

    const result = await publishViaStudio({
      videoPath,
      caption: composeCaption(post.video),
      privacyLevel: post.privacyLevel,
      expectUsername: post.account.username,
    });

    await recordLog(post.id, 'BROWSER_POST_CONFIRMED', {
      confirmedBy: result.confirmedBy,
      permalink: result.permalink,
      browserAccount: result.profile.username,
    });

    // Studio exposes no publish id; the confirmation plus permalink is the record we keep.
    return await markPublished(ctx, `studio-${new Date().toISOString()}`, result.permalink);
  } catch (error) {
    if (!(error instanceof BrowserError)) throw error;

    if (error.code === 'POST_UNCONFIRMED') {
      // The Post click landed but nothing confirmed it: a retry could publish the video twice.
      return await markManual(ctx, error.code, error.message);
    }
    if (error.code === 'NO_TIKTOK_SESSION') {
      await prisma.tikTokAccount
        .update({ where: { id: post.account.id }, data: { connectionStatus: 'DISCONNECTED' } })
        .catch(() => undefined);
      return await failOrRetry(ctx, error.code, error.message, {
        terminal: true,
        notification: { type: 'ACCOUNT_DISCONNECTED', title: 'TikTok login expired in the browser' },
      });
    }

    // Everything reaching here failed before the Post click, so a retry cannot double-post. Only a
    // wrong account or an unsupported runtime is worth failing terminally.
    const terminal = error.code === 'WRONG_BROWSER_ACCOUNT' || error.code === 'BROWSER_UNSUPPORTED_RUNTIME';
    return await failOrRetry(ctx, error.code, error.message, {
      terminal,
      notification: { type: 'PUBLISH_FAILED', title: 'Browser publish failed' },
    });
  } finally {
    await lease();
  }
}

async function pollUntilResolved(
  ctx: PublishContext,
  client: TikTokClient,
  accessToken: string,
  publishId: string,
): Promise<PublishOutcome> {
  const deadline = Date.now() + publishTimeoutMs();
  let delay = POLL_START_MS;

  for (;;) {
    try {
      const status = await client.fetchPublishStatus(accessToken, publishId);

      if (status.status === 'PUBLISH_COMPLETE') {
        return markPublished(ctx, publishId, status.publicPostIds[0] ?? null);
      }
      if (status.status === 'FAILED') {
        return failOrRetry(ctx, 'PUBLISH_REJECTED', status.failReason ?? 'TikTok reported the post as failed', {
          terminal: true,
          notification: { type: 'PUBLISH_FAILED', title: 'TikTok rejected the post' },
        });
      }
      if (status.status === 'SEND_TO_USER_INBOX') {
        return markManual(
          ctx,
          'INBOX_DELIVERED',
          'The video is in the creator inbox. Open TikTok to finish publishing it.',
        );
      }
    } catch (error) {
      if (isTerminalTikTokError(error)) {
        return markManual(ctx, 'STATUS_CHECK_FAILED', describeError(error));
      }
      log('warn', 'publish_status_retry', { postId: ctx.post.id, error: describeError(error) });
    }

    if (Date.now() > deadline) {
      return markManual(ctx, 'STATUS_TIMEOUT', 'TikTok kept processing past the job timeout; verify in the app');
    }
    await sleep(delay);
    delay = Math.min(delay * 2, POLL_MAX_MS);
  }
}

async function markPublished(
  ctx: PublishContext,
  publishId: string,
  publicPostId: string | null,
): Promise<PublishOutcome> {
  const { post } = ctx;
  const now = new Date();

  await prisma.$transaction([
    prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        publishedPostId: publicPostId,
        externalPublishId: publishId,
        errorMessage: null,
        nextAttemptAt: null,
      },
    }),
    prisma.video.update({ where: { id: post.video.id }, data: { status: 'PUBLISHED' } }),
    prisma.publishingLog.create({
      data: {
        scheduledPostId: post.id,
        event: 'PUBLISHED',
        responseMetadata: JSON.stringify({ publishId, publicPostId }),
      },
    }),
  ]);

  log('info', 'publish_succeeded', {
    postId: post.id,
    publishId,
    publicPostId,
    account: post.account.username,
    videoTitle: post.video.title,
  });

  await notify({
    userId: post.account.userId,
    type: 'PUBLISH_SUCCESS',
    title: 'Video published',
    message: `"${post.video.title}" is live on @${post.account.username}.`,
    telegram: ctx.telegram,
  });

  await maybeCompleteQueue(post.account.userId);
  return 'PUBLISHED';
}

async function markManual(ctx: PublishContext, code: string, message: string): Promise<PublishOutcome> {
  const { post } = ctx;
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'MANUAL_ACTION_REQUIRED', errorMessage: `${code}: ${message}`, nextAttemptAt: null },
  });
  await recordLog(post.id, code, { message });
  log('warn', 'publish_manual_action', { postId: post.id, code, reason: message, account: post.account.username });
  await notify({
    userId: post.account.userId,
    type: 'MANUAL_ACTION_REQUIRED',
    title: 'Manual action required',
    message: `${message} (post ${post.id})`,
    telegram: ctx.telegram,
  });
  return 'MANUAL';
}

async function failOrRetry(
  ctx: PublishContext,
  code: string,
  message: string,
  options: { terminal: boolean; notification?: { type: NotificationType; title: string } },
): Promise<PublishOutcome> {
  const { post } = ctx;
  const retryCount = post.retryCount + 1;
  const limit = post.maxRetries || maxRetries();
  const canRetry = !options.terminal && retryCount < limit;

  if (canRetry) {
    const nextAttemptAt = new Date(Date.now() + backoffMs(retryCount));
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'PENDING', retryCount, nextAttemptAt, errorMessage: `${code}: ${message}` },
    });
    await recordLog(post.id, code, { message, retryCount, nextAttemptAt: nextAttemptAt.toISOString() });
    await armPublishJob(post.id, nextAttemptAt);
    log('warn', 'publish_retry_scheduled', { postId: post.id, code, retryCount });
    return 'RETRY';
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'FAILED', retryCount, errorMessage: `${code}: ${message}`, nextAttemptAt: null },
  });
  await recordLog(post.id, code, { message, retryCount, terminal: true });
  log('error', 'publish_failed', {
    postId: post.id,
    code,
    reason: message,
    account: post.account.username,
    authMode: post.account.authMode,
    retryCount,
    publishId: post.externalPublishId,
  });
  await enqueueDeadLetter({ queue: 'publish', jobId: post.id, postId: post.id, reason: `${code}: ${message}` }).catch(
    () => undefined,
  );

  if (options.notification) {
    await notify({
      userId: post.account.userId,
      type: options.notification.type,
      title: options.notification.title,
      message: `${message} (post ${post.id})`,
      telegram: ctx.telegram,
    });
  }
  await maybeCompleteQueue(post.account.userId);
  return 'FAILED';
}

async function recordLog(postId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  await prisma.publishingLog
    .create({ data: { scheduledPostId: postId, event, requestMetadata: JSON.stringify(payload) } })
    .catch(() => undefined);
}

/** Notify once when a user's queue drains, then stay quiet for six hours. */
async function maybeCompleteQueue(userId: string): Promise<void> {
  const remaining = await prisma.scheduledPost.count({
    where: { account: { userId }, status: { in: ['PENDING', 'QUEUED', 'PUBLISHING'] } },
  });
  if (remaining > 0) return;
  const recent = await prisma.notification.findFirst({
    where: { userId, type: 'QUEUE_COMPLETED', createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) } },
    select: { id: true },
  });
  if (recent) return;
  await notify({
    userId,
    type: 'QUEUE_COMPLETED',
    title: 'Queue completed',
    message: 'Every scheduled post has been processed.',
  });
}

export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function describeError(error: unknown): string {
  if (error instanceof TikTokApiError) {
    // logId/requestId are what TikTok support asks for; keep them in the stored error message.
    const ids = [error.logId && `log_id=${error.logId}`, error.requestId && `request_id=${error.requestId}`].filter(Boolean);
    return [`${error.code} (HTTP ${error.httpStatus})`, ...ids].join(' ');
  }
  if (error instanceof SchedulingError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export function isTerminalTikTokError(error: unknown): boolean {
  return error instanceof TikTokApiError && !error.retryable;
}