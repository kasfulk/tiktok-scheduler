# BRAINSTORM — AI caption generation from the publishing queue

## Problem
Captions are typed by hand per video (or via templates). The publishing queue shows videos that
are about to go live, which is exactly where a bad/empty caption still hurts, but the queue
offers no way to write one. Requirement: draft a caption per queued video with a **local,
vision-capable AI model**, using the video thumbnail as the visual signal and the existing
caption as context.

## Requirements
1. Queue row action → generate a caption for that video.
2. Generation is vision-based: the thumbnail image is sent to the model.
3. The existing caption is passed as context (language/tone continuity).
4. Settings → new AI section: enable toggle, base URL, model name, optional API key, prompt.
5. Default prompt when the user has not written one:
   `Generate Caption berdasarkan thumbnail video, dengan hashtag yang berpotensi ramai sesuai dengan konteks`
6. Generated text must not go live unreviewed — the user edits/accepts before it replaces the caption.

## Decisions
- **Local model via OpenAI-compatible `/chat/completions`**, not a new SDK. Ollama, LM Studio,
  llama.cpp and vLLM all speak it; no dependency is added (native `fetch`).
- **Settings live on `User`** like the existing Telegram fields — no new table, no `getOrCreate`.
- **API key encrypted** with the existing `TOKEN_ENCRYPTION_KEY` helper and never returned to the
  client (`hasApiKey` + masked value only).
- **Prompt stored empty means "use the default constant"** (`DEFAULT_AI_CAPTION_PROMPT` in
  `@tiktok-scheduler/shared`) so the string exists once.
- **Model answers strict JSON** `{caption, hashtags}`; a text-only answer is salvaged by splitting
  trailing hashtag tokens out, so a model that ignores the JSON instruction still yields a usable
  caption without duplicated hashtags at publish time (`composeCaption` joins both fields).
- **Generation does not persist.** The dialog shows the draft; saving reuses the existing
  `PATCH /api/videos/[id]` path (no second write path, no new validation surface).

## Edge cases
- AI disabled or model empty → `409 AI_NOT_CONFIGURED`, UI points at Settings.
- Video without thumbnail (processing failed) → `422 THUMBNAIL_REQUIRED`.
- Model unreachable / non-2xx / timeout (120 s) → `502 AI_REQUEST_FAILED` with the reason.
- Hashtags normalised: `#` prefix, de-duplicated, capped at `TIKTOK_MAX_HASHTAGS`.
- Caption truncated to `TIKTOK_CAPTION_MAX_LENGTH`.

## Acceptance criteria
1. `POST /api/videos/:id/caption/generate` returns `{caption, hashtags, model}` using the
   thumbnail + stored prompt, and `409` when AI is not configured.
2. `GET/PATCH /api/settings/ai` round-trips config; key is write-only; enabling without a model is
   a `422` on `model`.
3. Queue rows expose the video's current caption and a per-row action that opens a dialog which
   auto-generates, allows edits, and saves through the existing video PATCH.
4. Settings has an AI tab with all five fields and reports the effective (default) prompt.
5. `npm run typecheck` and `npm test` pass; unit tests cover response normalisation.
