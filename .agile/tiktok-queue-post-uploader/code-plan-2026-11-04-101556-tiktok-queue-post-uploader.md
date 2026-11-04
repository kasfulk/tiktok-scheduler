# CODE_PLAN — AI caption generation

## Data flow
```
Queue page ──POST /api/videos/:id/caption/generate──▶ route
                                                       ├─ loadAiCaptionConfig(userId)   (User row)
                                                       ├─ read thumbnail file (media stub)
                                                       └─ POST {aiBaseUrl}/chat/completions
                                                              (messages: system + prompt + image_url)
Queue dialog ──PATCH /api/videos/:id {caption, hashtags}──▶ existing route (unchanged)
Worker publish composes caption + hashtags (unchanged)
```

## Exact files
| Action | Path |
|---|---|
| create | `apps/web/lib/ai.ts` — config loader, DTO mapper, request builder, response parser |
| create | `apps/web/app/api/videos/[id]/caption/generate/route.ts` |
| create | `apps/web/test/ai-caption.test.ts` |
| create | `apps/web/app/api/settings/ai/route.ts` |
| modify | `apps/web/app/api/queue/route.ts` — select caption/hashtags, emit `videoId` |
| modify | `apps/web/app/(dashboard)/queue/page.tsx` — caption column text + `GenerateCaptionDialog` |
| modify | `apps/web/app/(dashboard)/settings/page.tsx` — `AI Caption` tab |
| modify | `README.md` — one subsection on configuring a local vision model |

## Contracts (frozen; every slice codes against these)
```ts
// apps/web/lib/ai.ts
export interface AiCaptionConfig { baseUrl: string; model: string; apiKey: string | null; prompt: string }
export async function loadAiCaptionConfig(userId: string): Promise<AiCaptionConfig | null>
export function aiSettingsToDto(row: {
  aiCaptionEnabled: boolean; aiBaseUrl: string; aiModel: string;
  aiApiKey: string | null; aiPrompt: string;
}): AiSettingsDto
export function parseCaptionResponse(raw: string): { caption: string; hashtags: string }
export function splitHashtags(text: string): { text: string; hashtags: string[] }
export async function generateCaption(input: {
  config: AiCaptionConfig; prompt: string; existingCaption: string | null;
  title: string; imageBase64: string | null; fetchImpl?: typeof fetch;
}): Promise<{ caption: string; hashtags: string }>
```
- `POST /api/videos/:id/caption/generate` body `{ prompt?: string }` → `200 { caption, hashtags, model }`,
  `409 AI_NOT_CONFIGURED`, `404 VIDEO_NOT_FOUND`, `422 THUMBNAIL_REQUIRED`, `502 AI_REQUEST_FAILED`.
- `GET /api/settings/ai` → `AiSettingsDto`; `PATCH` accepts `{enabled?, baseUrl?, model?, apiKey?|null, prompt?|null}`,
  returns the same DTO, `422 VALIDATION_ERROR` with `path: 'model'` when enabled without a model.

## Implementation order
Contract (done) → Task 1 → Tasks 2/3/4 in parallel (disjoint files) → single typecheck + test run
→ review → verification.

## Regression areas
`composeCaption` in the worker is untouched; the only shared edit is the queue response shape, and
`QueueItemDto` is consumed solely by the queue page.
