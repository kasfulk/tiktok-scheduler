---
scope: tiktok-queue-post-uploader
session: 2026-11-16-201858-tiktok-queue-post-uploader
stage: CODING
status: IN_PROGRESS
updated: 2026-11-16 20:18
classification: BUG
completed: [intake, root_cause]
skipped:
  - BRAINSTORM: SKIPPED — root cause established; no external uncertainty
  - DEEP_RESEARCH: SKIPPED — root cause established; no external uncertainty
current: [coding]
next: [code_review, testing, verification]
---

# Content page filter/sort/pagination fix

## Intake
BUG: `/content` filter, sort, pagination controls have no effect.

## Root cause
`apps/web/app/(dashboard)/content/page.tsx` built `queryParams` for the TanStack query key but
`queryFn` fetched `/api/videos` with no query string. API support already exists
(`apps/web/app/api/videos/route.ts` + `listVideosQuerySchema`).

## Plan reference
`local://content-filters-fix-plan.md`
