import {
  BrowserError,
  closeTarget,
  evaluate,
  firstPageTarget,
  listTargets,
  openTarget,
  setFileInput,
  sleep,
  withSession,
  type CdpTarget,
  type Send,
} from './cdp';

/**
 * Publishes a video by driving the TikTok Studio upload page in the Chrome profile the user is
 * already logged into. Every selector below was read off the live page; TikTok ships no stable
 * contract, so each step re-checks what it found and fails with a named code instead of clicking
 * blindly.
 */
const STUDIO_UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const UPLOAD_TIMEOUT_MS = 15 * 60_000;
const POST_CONFIRM_TIMEOUT_MS = 120_000;
const POST_ARM_TIMEOUT_MS = 5 * 60_000;

export interface StudioProfile {
  openId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface StudioPublishInput {
  videoPath: string;
  caption: string;
  /** TikTok API privacy enum; mapped to the label the studio dropdown shows. */
  privacyLevel: string;
  /** Username the account row expects. A mismatch aborts instead of posting to the wrong account. */
  expectUsername?: string;
  /** Fill the form, then discard instead of clicking Post. Used to verify the flow safely. */
  dryRun?: boolean;
}

export interface StudioPublishResult {
  /** Studio shows no post id; the confirmation we could observe is what we record. */
  confirmedBy: 'modal' | 'redirect' | 'dry-run';
  permalink: string | null;
  profile: StudioProfile;
  /** What the form actually held right before Post — the receipt for a verification run. */
  caption: string;
  visibility: string;
}

/** Visibility labels in the studio dropdown, keyed by the API privacy enum. */
const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers you follow back',
  SELF_ONLY: 'Only you',
};

const js = JSON.stringify;

export async function readProfile(send: Send): Promise<StudioProfile> {
  const raw = await evaluate<string>(
    send,
    `fetch('https://www.tiktok.com/passport/web/account/info/?aid=1988', { credentials: 'include' })
      .then((r) => r.text())`,
  );
  let data: Record<string, string> | undefined;
  try {
    data = (JSON.parse(raw) as { data?: Record<string, string> }).data;
  } catch {
    data = undefined;
  }
  if (!data?.user_id_str) {
    throw new BrowserError(
      'NO_TIKTOK_SESSION',
      `TikTok does not recognise the session in the browser profile at ${process.env.BROWSER_CDP ?? 'the CDP endpoint'}. Log in there again.`,
    );
  }
  return {
    openId: data.user_id_str,
    username: data.username || data.unique_id || data.user_id_str,
    displayName: data.screen_name || null,
    avatarUrl: data.avatar_url || null,
  };
}

/** Studio opens leftover "wasn't saved" / preview modals; dismiss them without touching a post. */
const DISMISS_MODALS = `(() => {
  const wanted = [/^Discard$/i, /^Not now$/i, /^Got it$/i, /^Close$/i];
  let closed = 0;
  for (const button of document.querySelectorAll('button')) {
    const label = button.innerText.trim();
    if (wanted.some((re) => re.test(label))) { button.click(); closed += 1; }
  }
  return closed;
})()`;

const HAS_EDITOR = `!!document.querySelector('[data-e2e=post_video_button]')`;
const UPLOAD_STATE = `(() => {
  const node = document.querySelector('[data-e2e=upload_status_container]');
  return node ? node.innerText : '';
})()`;

async function waitForPage(send: Send, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // `openTarget` resolves while the tab is still about:blank; a fetch from there throws
    // "Failed to fetch" instead of returning TikTok's JSON.
    const ready = await evaluate<boolean>(
      send,
      `location.hostname.endsWith('tiktok.com') && document.readyState !== 'loading'`,
    ).catch(() => false);
    if (ready) return;
    await sleep(300);
  }
  throw new BrowserError('BROWSER_TIMEOUT', 'The Studio tab never navigated to tiktok.com');
}

async function waitForEditor(send: Send): Promise<void> {
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(send, HAS_EDITOR)) return;
    const state = await evaluate<string>(send, UPLOAD_STATE);
    if (/failed|error|couldn.?t upload/i.test(state)) {
      throw new BrowserError('UPLOAD_REJECTED', `TikTok Studio rejected the upload: ${state.slice(0, 200)}`);
    }
    await sleep(2_000);
  }
  throw new BrowserError('UPLOAD_TIMEOUT', 'TikTok Studio never showed the post editor after the file was attached');
}

/**
 * Studio paints Post as soon as the editor renders but keeps it inert until the video is
 * processed: `button.disabled` stays false while `aria-disabled` is "true", and React swallows the
 * click (observed arming ~50 s after the button appears). Clicking earlier is a silent no-op.
 */
async function waitForArmedPost(send: Send, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await evaluate<{ present: boolean; armed: boolean }>(
      send,
      `(() => {
        const button = document.querySelector('[data-e2e=post_video_button]');
        if (!button) return { present: false, armed: false };
        return { present: true, armed: !button.disabled && button.getAttribute('aria-disabled') !== 'true' };
      })()`,
    );
    if (state?.armed) return;
    if (Date.now() >= deadline) {
      throw new BrowserError(
        'POST_BUTTON_UNAVAILABLE',
        state?.present
          ? `The Post button stayed disabled for ${Math.round(timeoutMs / 1000)} s`
          : 'The Post button never appeared',
      );
    }
    await sleep(1_000);
  }
}

async function setCaption(send: Send, caption: string): Promise<string> {
  const typed = await evaluate<string>(
    send,
    `(() => {
      const editor = document.querySelector('[data-e2e=caption_container] div[contenteditable]');
      if (!editor) return 'NO_EDITOR';
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete');
      document.execCommand('insertText', false, ${js(caption)});
      return editor.innerText;
    })()`,
  );
  if (typed === 'NO_EDITOR') throw new BrowserError('CAPTION_EDITOR_MISSING', 'The caption box was not on the page');
  const seen = typed.replace(/\s+/g, ' ').trim();
  const wanted = caption.replace(/\s+/g, ' ').trim();
  if (!seen.includes(wanted.slice(0, 40))) {
    throw new BrowserError('CAPTION_NOT_APPLIED', `Studio caption reads "${seen.slice(0, 80)}"`);
  }
  return seen;
}

async function setPrivacy(send: Send, privacyLevel: string, timeoutMs: number): Promise<string> {
  // Long videos make the studio render the visibility select late; poll instead of a fixed sleep.
  const deadline = Date.now() + timeoutMs;
  let opened = false;
  while (Date.now() < deadline && !opened) {
    opened = await evaluate<boolean>(
      send,
      `(() => {
        const trigger = document.querySelector('[data-e2e=video_visibility_container] .Select__trigger');
        if (!trigger) return false;
        trigger.click();
        return true;
      })()`,
    );
    if (!opened) await sleep(1_000);
  }
  if (!opened) throw new BrowserError('VISIBILITY_SELECT_MISSING', 'The "Who can see this post" select never rendered');

  const label = PRIVACY_LABELS[privacyLevel] ?? 'Everyone';
  const picked = await evaluate<string>(
    send,
    `(() => {
      const option = [...document.querySelectorAll('label, li, [role=option]')]
        .find((node) => node.innerText.trim() === ${js(label)});
      if (!option) return 'NO_OPTION';
      option.click();
      return 'OK';
    })()`,
  );
  if (picked === 'NO_OPTION' && label !== 'Everyone') {
    // Leave the dropdown rather than posting with a privacy the schedule did not ask for.
    await evaluate(send, `document.body.click()`);
    throw new BrowserError('PRIVACY_OPTION_MISSING', `Studio has no "${label}" visibility option for this account`);
  }

  await sleep(500);
  const current = await evaluate<string>(
    send,
    `(() => {
      const node = document.querySelector('[data-e2e=video_visibility_container] .Select__trigger');
      return node ? node.innerText.trim() : '';
    })()`,
  );
  if (!current.includes(label)) {
    throw new BrowserError('PRIVACY_NOT_APPLIED', `Studio visibility reads "${current}" instead of "${label}"`);
  }
  return current;
}

/** Poll for whatever the studio shows after Post: it either redirects or opens a result dialog. */
async function waitForConfirmation(send: Send): Promise<StudioPublishResult['confirmedBy'] | null> {
  const deadline = Date.now() + POST_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await evaluate<string>(
      send,
      `(() => {
        const path = location.pathname;
        const text = document.body.innerText;
        if (/couldn.?t be posted|failed to post|Community guidelines|Something went wrong/i.test(text)) {
          return 'error:' + text.slice(0, 160);
        }
        if (/\\/tiktokstudio\\/(content|manage)/.test(path)) return 'redirect';
        if (/Your video is being|Your video has been|Video posted|posted to TikTok|Manage your posts/i.test(text)) {
          return 'modal';
        }
        // Leaving the upload route is the other honest confirmation; the editor vanishing is not.
        if (!/\\/tiktokstudio\\/upload/.test(path)) return 'redirect';
        return 'pending';
      })()`,
    );
    if (state === 'redirect' || state === 'modal') return state;
    if (state?.startsWith('error:')) {
      throw new BrowserError('POST_REJECTED', `TikTok Studio reported: ${state.slice(6)}`);
    }
    await sleep(2_000);
  }
  return null;
}

async function findPermalink(send: Send, username: string): Promise<string | null> {
  const href = await evaluate<string | null>(
    send,
    `(() => {
      const link = [...document.querySelectorAll('a[href*="/video/"]')]
        .map((a) => a.href)
        .find((h) => h.includes(${js(`/@${username}/video/`)}));
      return link ?? null;
    })()`,
  ).catch(() => null);
  return href ?? null;
}

/**
 * Runs the whole studio flow in one page target. The tab this function opens is closed on the way
 * out; a tab it adopted is left alone.
 */
export async function publishViaStudio(input: StudioPublishInput): Promise<StudioPublishResult> {
  // Always a fresh tab: adopting the user's own Studio tab would navigate a page they are watching.
  const opened = await openTarget(STUDIO_UPLOAD_URL);
  let target: CdpTarget | undefined;
  for (let i = 0; i < 40 && !target?.webSocketDebuggerUrl; i += 1) {
    await sleep(500);
    target = firstPageTarget(await listTargets(), (t) => t.id === opened.id);
  }
  if (!target?.webSocketDebuggerUrl) throw new BrowserError('BROWSER_UNREACHABLE', 'No usable Chrome page target');

  const wsUrl = target.webSocketDebuggerUrl;
  try {
    return await withSession(wsUrl, async (send) => {
      await send('Runtime.enable');
      await waitForPage(send);
      await evaluate(send, DISMISS_MODALS);

      const profile = await readProfile(send);
      if (input.expectUsername && profile.username.toLowerCase() !== input.expectUsername.toLowerCase()) {
        throw new BrowserError(
          'WRONG_BROWSER_ACCOUNT',
          `The browser is logged in as @${profile.username}, but this post belongs to @${input.expectUsername}`,
        );
      }

      await setFileInput(send, 'input[type=file][accept="video/*"]', input.videoPath);
      await waitForEditor(send);

      await evaluate(send, DISMISS_MODALS);
      const caption = await setCaption(send, input.caption);
      const visibility = await setPrivacy(send, input.privacyLevel, UPLOAD_TIMEOUT_MS);

      if (input.dryRun) {
        // Everything the real run needs, except the click: prove the Post button is armed.
        await waitForArmedPost(send, POST_ARM_TIMEOUT_MS);
        await evaluate(send, `document.querySelector('[data-e2e=discard_post_button]')?.click()`);
        await sleep(1_000);
        await evaluate(send, DISMISS_MODALS);
        return { confirmedBy: 'dry-run', permalink: null, profile, caption, visibility };
      }

      // "Now" is correct by construction: the scheduler only runs a post when it is due.
      await waitForArmedPost(send, POST_ARM_TIMEOUT_MS);
      const clicked = await evaluate<boolean>(
        send,
        `(() => {
          const button = document.querySelector('[data-e2e=post_video_button]');
          if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
          button.click();
          return true;
        })()`,
      );
      if (!clicked) throw new BrowserError('POST_BUTTON_UNAVAILABLE', 'The Post button never became clickable');

      const confirmedBy = await waitForConfirmation(send);
      if (!confirmedBy) {
        throw new BrowserError('POST_UNCONFIRMED', 'Post was clicked but Studio never confirmed it');
      }
      const permalink = await findPermalink(send, profile.username);
      return { confirmedBy, permalink, profile, caption, visibility };
    });
  } finally {
    if (target?.id) await closeTarget(target.id);
  }
}
