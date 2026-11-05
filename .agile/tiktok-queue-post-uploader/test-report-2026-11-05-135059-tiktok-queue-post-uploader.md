# TEST REPORT — generate schedule ignores the requested start time

Session: 2026-11-05-135059-tiktok-queue-post-uploader (scope `tiktok-queue-post-uploader`)

## Root cause (reproduced before the fix)

`GenerateScheduleDialog` sent `startTime` only for `FIXED_TIME` and `intervalMinutes` only for
`INTERVAL`. `generateIntervalSlots` falls back to `constraints.activeHours.start` when `startTime`
is absent, so INTERVAL/SMART plans started at the active-hours boundary; SMART additionally
violated `generateScheduleSchema.superRefine` (interval required) and returned 422.

Engine run with `npx tsx` (active hours 08:00–22:00, count 3):

```
INTERVAL 90 + startTime 14:30:                     14:30, 16:00, 17:30
INTERVAL 90 with NO startTime (old dialog payload): 08:00, 09:30, 11:00   <-- defect
FIXED_TIME 19:30/20:15:                            19:30, 20:15, next day 19:30
```

## Commands (repo root, 2026-11-05)

```
$ npx vitest run apps/web/test/schedule-payload.test.ts
 ✓ apps/web/test/schedule-payload.test.ts (6 tests) 2ms
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npx vitest run
 Test Files  1 failed | 7 passed (8)
      Tests  76 passed | 2 skipped (78)

$ npx tsc -p tsconfig.typecheck.json     -> exit 0, no output
$ npx eslint 'apps/web/app/(dashboard)/calendar/page.tsx' apps/web/lib/schedule-payload.ts \
    apps/web/test/schedule-payload.test.ts   -> no output
```

New tests (`apps/web/test/schedule-payload.test.ts`): INTERVAL carries `startTime` + `intervalMinutes`
and no `postingTimes`; SMART carries both; FIXED_TIME carries `postingTimes` and no `startTime`;
start/posting times outside the active hours are rejected; a malformed clock (`9:30`) returns
`{ ok: false }` instead of throwing from `timeToMinutes`.

## Pre-existing failure

`apps/worker/test/publish.test.ts` fails to load `@tiktok-scheduler/browser` from
`apps/worker/src/publish.ts`. Reproduced with `git stash` of this change → identical error, so it is
not a regression. Earlier reports recorded these 2 tests as skipped because Redis was down; with the
local Redis up the `describe.skipIf(!hasRedis)` block loads and hits the unresolved workspace import.
