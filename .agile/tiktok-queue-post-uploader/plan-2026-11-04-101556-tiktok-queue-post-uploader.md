# PLAN — AI caption generation

## Objective
Let a user draft a caption for a queued video with a local vision model, review it, and save it,
without touching the worker or the publish contract.

## Files
### Already landed (shared contract, orchestrator)
- `prisma/schema.prisma` — `User.aiCaptionEnabled | aiBaseUrl | aiModel | aiApiKey | aiPrompt`
- `prisma/migrations/20261104101500_ai_caption_settings/migration.sql` (applied)
- `packages/shared/src/schemas.ts` — `DEFAULT_AI_CAPTION_PROMPT`, `aiSettingsSchema`, `generateCaptionSchema`
- `apps/web/lib/types.ts` — `AiSettingsDto`, `GenerateCaptionResult`, caption fields on `QueueItemDto`
- `apps/web/lib/api-client.ts` — `queryKeys.aiSettings`

### Task 1 — AI client + generate route (`apps/web/lib/ai.ts`, `apps/web/app/api/videos/[id]/caption/generate/route.ts`, `apps/web/test/ai-caption.test.ts`)
Depends on: contract. Exports consumed by Task 2 and Task 3.

### Task 2 — AI settings API (`apps/web/app/api/settings/ai/route.ts`)
Depends on: Task 1's `aiSettingsToDto`.

### Task 3 — Queue (route payload + per-row dialog)
Depends on: Task 1's route + contract types.

### Task 4 — Settings AI tab (+ README note)
Depends on: contract types only.

## Risks
- A local vision model is slow (10–60 s). Mitigation: 120 s abort, dialog shows a pending state,
  route wrapped by the existing error envelope so a hang surfaces as a toast, not a dead tab.
- Model may ignore the JSON instruction. Mitigation: `parseCaptionResponse` tolerates plain text.
- API key leakage. Mitigation: never serialised; only `hasApiKey`/masked value cross the wire.

## Acceptance
Same list as the brainstorm document; proven by `npm run typecheck`, `npm test` and a live
end-to-end call against a temporary OpenAI-compatible stub.
