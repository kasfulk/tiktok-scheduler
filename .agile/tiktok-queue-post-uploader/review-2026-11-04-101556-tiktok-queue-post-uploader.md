# CODE_REVIEW — AI caption generation

Verdict: **PASS** after the fixes below. Reviewed against the brainstorm acceptance criteria, the
existing conventions (`route()` wrapper, zod in `@tiktok-scheduler/shared`, encrypted secrets,
`apiFetch` + TanStack Query on the client), and the publish path.

## Findings raised and fixed during review
| Severity | Finding | Fix |
|---|---|---|
| High | `apps/web/app/api/queue/route.ts` emitted only the six new fields; the items lost `accountUsername`, `scheduledAt`, `localTime`, `status`, `retryCount`, `errorMessage` (caught by typecheck, would have broken the queue table) | fields restored |
| High | Queue page: `hashtags` state never declared, `confirmCancel` state deleted by the edit → both a compile error and a broken cancel flow | both restored |
| Medium | `PATCH` on the settings route dereferenced a possibly-`null` `findUnique` result | explicit `401 UNAUTHORIZED` guard on GET and PATCH |
| Medium | `satisfies Prisma.UserSelect` used a namespace that is not imported in the workspace | annotation removed |
| Medium | `parseCaptionResponse` fell back to prose when the model returned a JSON object with an empty caption, so `{...}` would end up in the caption text | a JSON-shaped answer is now authoritative |
| Low | Save failure in the dialog produced an unhandled rejection (no feedback) | caught, rendered in the dialog's error slot |
| Low | `Regenerate` was only reachable after an error | always available |
| Low | `import { GeneralSettingsDto, … }` dropped `type` on a type-only import (fragile under `isolatedModules`) | restored `import type` |
| Low | Test imported `../lib/ai.ts` (needs `allowImportingTsExtensions`) | `../lib/ai` |

## Confirmed strengths
- No dependency added; the model is reached over plain `fetch` against the OpenAI-compatible
  `/chat/completions` shape, so Ollama, LM Studio, llama.cpp and vLLM all work through one setting.
- The API key never crosses the wire (DTO exposes `hasApiKey` + masked value only) and is written
  through the existing `encryptSecret`.
- Generation is side-effect free; the write goes through the pre-existing `PATCH /api/videos/:id`,
  so there is one validated write path and `composeCaption` in the worker is untouched.
- Prompt default lives once (`DEFAULT_AI_CAPTION_PROMPT`); the DB stores `''` to mean "use it".
- `lib/ai.ts` imports no `@/` alias and no client-reachable module, so `node:fs` cannot leak into a
  client bundle.

## Residual notes (not blocking)
- `next build` fails on `/` and `/_global-error` prerender — reproduced on a clean `HEAD`, so it is a
  pre-existing defect of the project, outside this feature's scope.
- `/api/queue` hangs when Redis is unreachable (`maxRetriesPerRequest: null` in the BullMQ
  connection, no timeout), pre-existing; documented, not changed here.
