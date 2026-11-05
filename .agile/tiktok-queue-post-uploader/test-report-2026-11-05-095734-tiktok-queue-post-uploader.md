# TEST REPORT — mass scheduler

Commands (repo root, 2026-11-05):

```
$ npm run typecheck
> tsc -p tsconfig.typecheck.json
(clean, 5.2s)

$ npm test
 ✓ packages/tiktok/test/index.test.ts (16 tests)
 ✓ packages/scheduler/test/engine.test.ts (20 tests)
 ✓ packages/shared/test/time.test.ts (14 tests)
 ✓ apps/web/test/multipart.test.ts (4 tests)
 ✓ apps/web/test/ai-caption.test.ts (13 tests)
 ↓ apps/worker/test/publish.test.ts (2 tests | 2 skipped)   # needs Redis
 ✓ packages/db/test/mass-schedule.test.ts (3 tests)
 Test Files  6 passed | 1 skipped (7)
      Tests  70 passed | 2 skipped (72)

$ npx eslint packages/db/src/mass-schedule.ts packages/db/src/scheduling.ts packages/db/src/index.ts \
    packages/shared/src/schemas.ts apps/web/app/api/schedules/bulk-reschedule/route.ts \
    'apps/web/app/(dashboard)/queue/page.tsx' apps/web/lib/types.ts packages/db/test/mass-schedule.test.ts
(no output = clean)
```

New tests: `packages/db/test/mass-schedule.test.ts` — TIME keeps the local date, DATE keeps the
local time, and a wall-clock round-trip across the US DST boundary.

Live run (local `next dev -p 3107`, temp user seeded with 4 posts: 2 PENDING, 1 QUEUED, 1 PUBLISHED):

```
POST /api/schedules/bulk-reschedule {"mode":"TIME","time":"19:30"}
{"data":{"updated":3,"staggered":1,"skipped":[{"id":"…","code":"POST_IMMUTABLE","message":"A published post cannot be rescheduled"}]}}
QUEUED 2026-11-10 19:30   QUEUED 2026-11-10 19:31   QUEUED 2026-11-11 19:30   (published row untouched)

POST /api/schedules/bulk-reschedule {"mode":"DATE","date":"2026-12-01"}
{"data":{"updated":3,"staggered":1,"skipped":[]}}
QUEUED 2026-12-01 19:30   QUEUED 2026-12-01 19:31   QUEUED 2026-12-01 19:32
```

Browser (Chromium, browser TZ Asia/Makassar +8, post TZ Asia/Jakarta +7): `/queue` shows the
checkbox column, "Select all", the "3 selected / Mass schedule / Clear" toolbar; the dialog
prefills 09:00 / 2026-11-10 (the post wall clock) and applying it yields 10:00 AM / 10:01 AM in
the browser TZ with toast "3 post(s) rescheduled, 2 spaced 1 minute apart"; date-only run kept the
times (9:15 / 9:16 / 9:17 PM) and changed the date to 12/24.
