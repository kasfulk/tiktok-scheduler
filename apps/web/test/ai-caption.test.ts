import { describe, expect, it } from 'vitest';
import { generateCaption, parseCaptionResponse, splitHashtags } from '../lib/ai';
import { TIKTOK_CAPTION_MAX_LENGTH, TIKTOK_MAX_HASHTAGS } from '@tiktok-scheduler/shared';

describe('parseCaptionResponse', () => {
  it('parses a strict JSON object', () => {
    const result = parseCaptionResponse('{"caption":"Great video!","hashtags":"#fyp #viral"}');
    expect(result.caption).toBe('Great video!');
    expect(result.hashtags).toBe('#fyp #viral');
  });

  it('strips a fenced ```json object', () => {
    const result = parseCaptionResponse('```json\n{"caption":"Nice!","hashtags":"#nice"}\n```');
    expect(result.caption).toBe('Nice!');
    expect(result.hashtags).toBe('#nice');
  });

  it('merges hashtags already inside the caption with the explicit hashtags field, deduplicating', () => {
    const result = parseCaptionResponse(
      '{"caption":"Cool clip #fyp #viral","hashtags":"#fyp #cooking #Viral"}',
    );
    expect(result.hashtags).toBe('#fyp #viral #cooking');
    expect(result.hashtags.split(' ')).toHaveLength(3);
    for (const tag of result.hashtags.split(' ')) {
      expect(tag.startsWith('#')).toBe(true);
    }
  });

  it('separates trailing hashtags from plain prose', () => {
    const result = parseCaptionResponse('What a beautiful sunset today #sunset #nature');
    expect(result.caption).toBe('What a beautiful sunset today');
    expect(result.hashtags).toBe('#sunset #nature');
  });

  it('falls back to prose when the JSON is malformed', () => {
    const result = parseCaptionResponse('{not valid json but #tag1 here');
    expect(result.caption).toBe('{not valid json but here');
    expect(result.hashtags).toBe('#tag1');
  });

  it('truncates a caption longer than TIKTOK_CAPTION_MAX_LENGTH', () => {
    const longCaption = 'a'.repeat(TIKTOK_CAPTION_MAX_LENGTH + 50);
    const result = parseCaptionResponse(`{"caption":"${longCaption}","hashtags":"#x"}`);
    expect(result.caption).toHaveLength(TIKTOK_CAPTION_MAX_LENGTH);
    expect(result.caption).toBe('a'.repeat(TIKTOK_CAPTION_MAX_LENGTH));
  });

  it('caps hashtags at TIKTOK_MAX_HASHTAGS', () => {
    const tags = Array.from({ length: TIKTOK_MAX_HASHTAGS + 10 }, (_, i) => `#tag${i}`).join(' ');
    const result = parseCaptionResponse(`prose ${tags}`);
    expect(result.hashtags.split(' ')).toHaveLength(TIKTOK_MAX_HASHTAGS);
  });
});

describe('splitHashtags', () => {
  it('extracts a unicode tag', () => {
    const result = splitHashtags('coklat #cokelat_sedap #100');
    expect(result.hashtags).toEqual(['#cokelat_sedap', '#100']);
    expect(result.text).toBe('coklat');
  });

  it('deduplicates case-insensitively and normalises leading #', () => {
    const result = splitHashtags('#fyp #FYP fyp #viral');
    expect(result.hashtags).toEqual(['#fyp', '#viral']);
  });

  it('returns empty hashtags for tag-free input', () => {
    const result = splitHashtags('just some prose');
    expect(result.hashtags).toEqual([]);
    expect(result.text).toBe('just some prose');
  });
});

describe('generateCaption', () => {
  const config = {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llava',
    apiKey: 'test-key',
    prompt: 'Make a caption',
  };

  it('sends the model, image_url, existing caption and Bearer header when a key is set', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"caption":"Hello","hashtags":"#hi"}' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await generateCaption({
      config,
      prompt: 'Make a caption',
      existingCaption: 'old caption',
      title: 'My Video',
      imageBase64: 'QUJD',
      fetchImpl,
    });

    expect(result.caption).toBe('Hello');
    expect(result.hashtags).toBe('#hi');
    expect(capturedUrl).toBe('http://127.0.0.1:11434/v1/chat/completions');
    const headers = new Headers(capturedInit!.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-key');
    const body = JSON.parse(capturedInit!.body as string) as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe('llava');
    const userContent = body.messages[1]?.content;
    if (!Array.isArray(userContent)) throw new Error('expected multimodal content parts');
    const parts = userContent as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const textPart = parts.find((part) => part.type === 'text');
    const imagePart = parts.find((part) => part.type === 'image_url');
    expect(textPart?.text).toContain('My Video');
    expect(textPart?.text).toContain('old caption');
    expect(imagePart?.image_url?.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('omits the Bearer header when no key is set', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"caption":"ok"}' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await generateCaption({
      config: { ...config, apiKey: null },
      prompt: 'Make a caption',
      existingCaption: null,
      title: 'My Video',
      imageBase64: null,
      fetchImpl,
    });
    expect(new Headers(capturedInit!.headers).get('Authorization')).toBeNull();
  });

  it('rejects with the status code when the model returns a non-OK response', async () => {
    const fetchImpl = (async () =>
      new Response('oops', { status: 500, headers: { 'content-type': 'text/plain' } })) as typeof fetch;

    await expect(
      generateCaption({
        config,
        prompt: 'Make a caption',
        existingCaption: null,
        title: 'My Video',
        imageBase64: null,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('500') });
  });

  it('ignores an SSE trailer appended to the JSON body', async () => {
    // Some OpenAI-compatible proxies answer a non-streaming request with `{...}data: [DONE]`.
    const body =
      JSON.stringify({ choices: [{ message: { content: '{"caption":"Trailer","hashtags":"#t"}' } }] }) +
      'data: [DONE]\n\n';
    const fetchImpl = (async () =>
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const result = await generateCaption({
      config,
      prompt: 'Make a caption',
      existingCaption: null,
      title: 'My Video',
      imageBase64: null,
      fetchImpl,
    });
    expect(result.caption).toBe('Trailer');
    expect(result.hashtags).toBe('#t');
  });
});
