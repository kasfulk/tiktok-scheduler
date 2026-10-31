import { createNotification } from '@tiktok-scheduler/db';
import { log, type NotificationType } from '@tiktok-scheduler/shared';

/** In-app notification plus optional Telegram delivery; never throws into the publish path. */
export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  telegram?: { enabled: boolean; chatId: string | null };
}): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
    });
  } catch (error) {
    log('warn', 'notification_failed', { error: error instanceof Error ? error.message : String(error) });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = params.telegram?.chatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
  if (!params.telegram?.enabled || !token || !chatId) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `*${params.title}*\n${params.message}`,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      log('warn', 'telegram_send_failed', { status: response.status });
    }
  } catch (error) {
    log('warn', 'telegram_unreachable', { error: error instanceof Error ? error.message : String(error) });
  }
}