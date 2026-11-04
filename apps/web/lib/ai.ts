import { prisma, decryptSecret, maskSecret } from '@tiktok-scheduler/db';
import { DEFAULT_AI_CAPTION_PROMPT, TIKTOK_CAPTION_MAX_LENGTH, TIKTOK_MAX_HASHTAGS } from '@tiktok-scheduler/shared';
import type { AiSettingsDto } from './types';

export interface AiCaptionConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  prompt: string;
}

export async function loadAiCaptionConfig(userId: string): Promise<AiCaptionConfig | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiCaptionEnabled: true,
      aiBaseUrl: true,
      aiModel: true,
      aiApiKey: true,
      aiPrompt: true,
    },
  });
  if (!row || !row.aiCaptionEnabled || row.aiModel.trim() === '') return null;
  return {
    baseUrl: row.aiBaseUrl.trim() || 'http://127.0.0.1:11434/v1',
    model: row.aiModel.trim(),
    apiKey: row.aiApiKey ? decryptSecret(row.aiApiKey) : null,
    prompt: row.aiPrompt.trim() || DEFAULT_AI_CAPTION_PROMPT,
  };
}

export function aiSettingsToDto(row: {
  aiCaptionEnabled: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string | null;
  aiPrompt: string;
}): AiSettingsDto {
  let apiKeyMasked: string | null = null;
  if (row.aiApiKey) {
    try {
      apiKeyMasked = maskSecret(decryptSecret(row.aiApiKey));
    } catch {
      apiKeyMasked = '••••';
    }
  }
  return {
    enabled: row.aiCaptionEnabled,
    baseUrl: row.aiBaseUrl,
    model: row.aiModel,
    hasApiKey: Boolean(row.aiApiKey),
    apiKeyMasked,
    prompt: row.aiPrompt.trim() || DEFAULT_AI_CAPTION_PROMPT,
    defaultPrompt: DEFAULT_AI_CAPTION_PROMPT,
  };
}

const HASHTAG_RE = /#(\p{L}[\p{L}\p{N}_]*|\p{N}[\p{L}\p{N}_]*)/gu;

export function splitHashtags(text: string): { text: string; hashtags: string[] } {
  const found = [...text.matchAll(HASHTAG_RE)];
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const match of found) {
    const tag = `#${match[1]}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hashtags.push(tag);
    if (hashtags.length === TIKTOK_MAX_HASHTAGS) break;
  }
  const clean = text.replace(HASHTAG_RE, ' ').replace(/\s+/g, ' ').trim();
  return { text: clean, hashtags };
}

export function parseCaptionResponse(raw: string): { caption: string; hashtags: string } {
  let body = raw.trim();

  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  if (fence) body = (fence[1] ?? '').trim();

  const brace = body.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      const parsed: unknown = JSON.parse(brace[0]);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as { caption?: unknown; hashtags?: unknown };
        let caption = '';
        let tagStrings: string[] = [];

        if (typeof obj.caption === 'string' && obj.caption.trim() !== '') {
          const split = splitHashtags(obj.caption);
          caption = split.text;
          tagStrings = split.hashtags;
        }

        if (typeof obj.hashtags === 'string' && obj.hashtags.trim() !== '') {
          const extra = obj.hashtags
            .split(/[\s,]+/)
            .filter((t) => t.trim() !== '')
            .map((t) => (t.startsWith('#') ? t : `#${t}`));
          const seen = new Set(tagStrings.map((t) => t.toLowerCase()));
          for (const tag of extra) {
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            tagStrings.push(tag);
            if (tagStrings.length === TIKTOK_MAX_HASHTAGS) break;
          }
        }

        if ('caption' in obj || 'hashtags' in obj) {
          return {
            caption: caption.slice(0, TIKTOK_CAPTION_MAX_LENGTH),
            hashtags: tagStrings.join(' '),
          };
        }
      }
    } catch {
      // malformed JSON, fall through to prose
    }
  }

  const split = splitHashtags(body);
  return {
    caption: split.text.slice(0, TIKTOK_CAPTION_MAX_LENGTH),
    hashtags: split.hashtags.join(' '),
  };
}

/**
 * Parse the first complete JSON value in `text`.
 *
 * OpenAI-compatible proxies sometimes append an SSE trailer (`data: [DONE]`) to a non-streaming
 * JSON body, which makes `response.json()` throw "Unexpected non-whitespace character after JSON".
 * Scanning for the balanced object tolerates that trailing junk.
 */
export function parseFirstJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start === -1) throw new SyntaxError('No JSON object in the response');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new SyntaxError('Incomplete JSON in the response');
}

export async function generateCaption(input: {
  config: AiCaptionConfig;
  prompt: string;
  existingCaption: string | null;
  title: string;
  imageBase64: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ caption: string; hashtags: string }> {
  const { config, prompt, existingCaption, title, imageBase64, fetchImpl } = input;
  const fetchFn = fetchImpl ?? fetch;

  const system =
    'You are a TikTok caption writer. Reply with ONLY the JSON object ' +
    '{"caption":"...","hashtags":"#tag1 #tag2"}. ' +
    'The caption must be at most 300 characters. Use 5 to 12 hashtags. No markdown, no code fences.';

  let userText = `${prompt}\n\nVideo title: ${title}`;
  if (existingCaption && existingCaption.trim() !== '') {
    userText += `\n\nThe current caption is:\n${existingCaption}\nKeep the caption in the same language and tone.`;
  }

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: userText }];
  if (imageBase64 !== null) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.8,
        max_tokens: 512,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach the AI model at ${config.baseUrl}: ${message}`);
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 200);
    throw new Error(`Model returned ${response.status}: ${text}`);
  }

  const data: unknown = parseFirstJson(await response.text());
  let contentStr: string | undefined;
  if (data && typeof data === 'object' && 'choices' in data) {
    const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
    if (choice && typeof choice === 'object' && 'message' in choice) {
      const msg: unknown = choice.message;
      if (msg && typeof msg === 'object' && 'content' in msg && typeof msg.content === 'string') {
        contentStr = msg.content;
      }
    }
  }
  if (!contentStr || contentStr.trim() === '') {
    throw new Error('The model returned an empty response');
  }

  return parseCaptionResponse(contentStr);
}
