# Test report — content list filter/sort/pagination

Session: 2026-11-16-201858-tiktok-queue-post-uploader · Date: 2026-11-16 20:21–20:35

## Static checks (local, macOS, repo root)
```
npx prisma generate           # stale client — required for the d710d18 migration
> Generated Prisma Client (v6.19.3)

npm run typecheck
> tsc -p tsconfig.typecheck.json          # no output, exit 0

npm run lint
✖ 11 problems (4 errors, 7 warnings)
  apps/web/app/(dashboard)/settings/page.tsx  280:5  unused 'control'
  ecosystem.config.cjs                        2:12, 3:14  require() style import
  packages/scheduler/src/engine.ts            16:3  unused 'ExistingOccupancy'
```
All 4 lint errors predate this change (present at `d710d18`, none in the edited file). Warnings are `no-console` in scripts.

```
npm test
 ✓ apps/web/test/schedule-payload.test.ts (6 tests)
 ✓ apps/web/test/middleware.test.ts (3)
 ✓ apps/web/test/calendar-date.test.ts (1)
 ✓ packages/scheduler/test/engine.test.ts (18)
 ✓ packages/shared/test/time.test.ts (14)
 ✓ packages/db/test/mass-schedule.test.ts (3)
 ✓ apps/web/test/multipart.test.ts (4)
 ✓ apps/web/test/ai-caption.test.ts (14)
 ✓ packages/tiktok/test/index.test.ts (16)
 Test Files  9 passed | 1 skipped (10)
      Tests  79 passed | 2 skipped (81)
```

## Build + deploy (remote `thinkcentre`, pm2)
```
npx prisma generate && npm run build
  ├ ƒ /content ... (build completed, 16.33s)
pm2 restart tiktok-scheduler-web tiktok-scheduler-demo-web
  │ 7  tiktok-scheduler-web       pid 2890174  online
  │ 9  tiktok-scheduler-demo-web  pid 2890189  online
```

## Regression check (no test covers this page)
No unit test targets the content page's fetch layer; the behavior was proven end-to-end against the running app instead (see verification artifact). No new test added: the code under change is a fetch-parameter assembly already exercised by the live browser run, and a jsdom test would re-assert the same string building it sits on.
