# VERIFICATION — AI caption generation

Each acceptance criterion from `brainstorm-*.md`, with the executed proof.

| # | Criterion | Executed proof |
|---|---|---|
| 1 | Generate endpoint uses thumbnail + stored prompt, 409 when unconfigured | stub request captured `image_url` `data:image/jpeg;base64,/9j/4AAQ…` (real thumbnail bytes, 355 chars), prompt = default text, current caption included; disabled state returned `409 AI_NOT_CONFIGURED`; response `{"caption":"Kucing lucu lagi makan ikan","hashtags":"#fyp #kucinglucu #viral","model":"llava-test"}` |
| 2 | Settings API round-trips, key write-only, enabling without model is 422 | `PATCH {enabled:true}` → `422 VALIDATION_ERROR` details `[{path:"model",…}]`; `PATCH {enabled:true,baseUrl,model,apiKey}` → `hasApiKey:true`, `apiKeyMasked:"secr…23"`, no plaintext; `GET` after → same DTO |
| 3 | Queue rows expose current caption + per-row action that auto-generates, edits, saves through the video PATCH | `/api/queue` items include `videoId`, `caption`, `hashtags`; scripted UI: dialog opened, fields auto-filled, edited text saved → toast `Caption saved`, row updated, `GET /api/videos/:id` returns `Kucing lucu makan ikan, hasil edit UI #fyp #kucinglucu #viral` |
| 4 | Settings tab with all five fields reporting the effective default prompt | scripted UI `/settings` → AI Caption: model `llava-test`, baseUrl `http://127.0.0.1:8799/v1`, placeholder `Stored (secr…23) — leave blank to keep`, prompt = the default string, switch `aria-checked=true`, `Clear key` button present |
| 5 | `typecheck` + tests pass, response normalisation covered | `npm run typecheck` exit 0, no output; `npm test` → `Test Files 5 passed | 1 skipped`, `Tests 67 passed | 2 skipped`; `apps/web/test/ai-caption.test.ts` 13 cases |

## Environment notes
- Verification ran with a throwaway OpenAI-compatible stub (:8799), a local Redis, the Next dev
  server, and a temporary user/video/scheduled post — all removed afterwards (`remaining users 3`,
  thumbnail deleted, temp scripts deleted, no `AGENTS.md` generated file left behind).
- `npm run build` fails identically on a clean `HEAD` tree (`/_global-error` prerender), so the build
  gate is reported as a pre-existing project failure, not a regression of this change.
