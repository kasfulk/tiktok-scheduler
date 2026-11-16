---
scope: tiktok-queue-post-uploader
session: 2026-11-16-201858-tiktok-queue-post-uploader
stage: COMPLETE
status: DONE
updated: 2026-11-16 20:36
classification: BUG
completed: [intake, root_cause, coding, code_review, testing, verification, deploy]
skipped:
  - BRAINSTORM: SKIPPED — root cause established; no external uncertainty
  - DEEP_RESEARCH: SKIPPED — root cause established; no external uncertainty
current: []
next: []
---

# Content page filter/sort/pagination fix

## Intake
BUG: `/content` filter, sort, pagination controls had no effect.

## Root cause
`apps/web/app/(dashboard)/content/page.tsx` built `queryParams` for the TanStack query key but
`queryFn` fetched `/api/videos` with no query string. API support already existed
(`apps/web/app/api/videos/route.ts` + `listVideosQuerySchema`).

## Fix
Commit `3d87353` — send the params as a query string, drop empty values (`status=` would 422),
reset to page 1 when sort or order changes.

## Deploy
- Pushed `d710d18..3d87353` to `origin/main`.
- Remote `thinkcentre:~/Projects/tiktok-scheduler` patched with `git apply` (its 8 uncommitted
  WIP files preserved), `prisma generate` + `npm run build`, then
  `pm2 restart tiktok-scheduler-web tiktok-scheduler-demo-web`.
- Both checkouts are now at the same code for this file; remote WIP remains uncommitted by design.

## Artifacts
- review-2026-11-16-201858-tiktok-queue-post-uploader.md
- test-report-2026-11-16-201858-tiktok-queue-post-uploader.md
- verification-2026-11-16-201858-tiktok-queue-post-uploader.md

## Follow-up worth knowing
The remote checkout has diverged work-in-progress (schedule-post-dialog feature) that is built
into the running app but never committed. That is the source of the "why does prod differ from
main" confusion; it is unrelated to this bug.
